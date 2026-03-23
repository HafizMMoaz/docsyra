import { clearSessionCookie, createLucia, setSessionCookie } from "@/lib/auth";
import { getRequestContext } from "@cloudflare/next-on-pages";
import {
  clearOAuthCookies,
  createGitHubOAuth,
  createGoogleOAuth,
  readOAuthCodeVerifier,
  readOAuthState,
  type OAuthProvider,
} from "@/lib/auth/oauth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getDB } from "@/lib/db/client";
import { createUser, getUserByEmail, getUserById, updateUserProfile } from "@/lib/db/queries";

type ProviderUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
};

type IdentityRow = {
  user_id: string;
};

type Params = {
  provider: string;
};

export const runtime = "edge";

function asProvider(provider: string): OAuthProvider | null {
  if (provider === "google" || provider === "github") {
    return provider;
  }
  return null;
}

async function fetchGoogleUser(accessToken: string): Promise<ProviderUser> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user");
  }

  const data = (await response.json()) as { sub?: string; email?: string; name?: string; picture?: string };

  if (!data.sub) {
    throw new Error("Missing Google user id");
  }

  return {
    id: data.sub,
    email: data.email ?? null,
    name: data.name ?? null,
    avatar_url: data.picture ?? null,
  };
}

async function fetchGitHubUser(accessToken: string): Promise<ProviderUser> {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Docsyra",
    },
  });

  if (!userResponse.ok) {
    throw new Error("Failed to fetch GitHub user");
  }

  const userData = (await userResponse.json()) as {
    id?: number;
    name?: string;
    email?: string | null;
    avatar_url?: string;
  };

  if (!userData.id) {
    throw new Error("Missing GitHub user id");
  }

  let email: string | null = userData.email ?? null;

  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Docsyra",
      },
    });

    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((entry) => entry.primary && entry.verified) ?? emails.find((entry) => entry.verified);
      email = primary?.email ?? null;
    }
  }

  return {
    id: String(userData.id),
    email,
    name: userData.name ?? null,
    avatar_url: userData.avatar_url ?? null,
  };
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

async function fillEmptyUserProfile(userId: string, providerUser: ProviderUser, env: any): Promise<void> {
  const existingUser = await getUserById(userId, env);
  if (!existingUser) {
    return;
  }

  const updates: { name?: string | null; avatar_url?: string | null } = {};

  if (isBlank(existingUser.attributes.name) && !isBlank(providerUser.name)) {
    updates.name = providerUser.name;
  }

  if (isBlank(existingUser.attributes.avatar_url) && !isBlank(providerUser.avatar_url)) {
    updates.avatar_url = providerUser.avatar_url;
  }

  await updateUserProfile(userId, updates, env);
}

async function getIdentityUserId(
  provider: OAuthProvider,
  providerUserId: string,
  env: any,
): Promise<string | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ? LIMIT 1")
    .bind(provider, providerUserId)
    .first<IdentityRow>();

  return row?.user_id ?? null;
}

async function linkIdentity(
  provider: OAuthProvider,
  providerUserId: string,
  userId: string,
  email: string | null,
  name: string | null,
  avatar_url: string | null,
  env: any,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare(
      "INSERT INTO auth_identities (id, user_id, provider, provider_user_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), userId, provider, providerUserId, email, name, avatar_url)
    .run();
}

export async function GET(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { env } = getRequestContext();
  const { provider: providerParam } = await context.params;
  const provider = asProvider(providerParam);

  if (!provider) {
    return Response.json({ success: false, error: "Unsupported provider" }, { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const storedState = readOAuthState(request, provider);
  if (!code || !state || !storedState || state !== storedState) {
    return Response.json({ success: false, error: "Invalid OAuth state" }, { status: 400 });
  }

  try {
    const origin = url.origin;
    let providerUser: ProviderUser;

    if (provider === "google") {
      const codeVerifier = readOAuthCodeVerifier(request, provider);
      if (!codeVerifier) {
        return Response.json({ success: false, error: "Missing PKCE verifier" }, { status: 400 });
      }

      const google = createGoogleOAuth(env, origin);
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      providerUser = await fetchGoogleUser(tokens.accessToken());
    } else {
      const github = createGitHubOAuth(env, origin);
      const tokens = await github.validateAuthorizationCode(code);
      providerUser = await fetchGitHubUser(tokens.accessToken());
    }

    const lucia = createLucia(env);
    const currentSessionId = readSessionIdFromRequest(request, env);
    const currentSession = currentSessionId ? await lucia.validateSession(currentSessionId) : { user: null, session: null };

    let userId: string;
    const existingIdentityUserId = await getIdentityUserId(provider, providerUser.id, env);

    if (currentSession.user && currentSession.session) {
      userId = currentSession.user.id;

      if (existingIdentityUserId && existingIdentityUserId !== userId) {
        return Response.json(
          { success: false, error: "This OAuth account is already linked to another user" },
          { status: 409 },
        );
      }

      if (!existingIdentityUserId) {
        await linkIdentity(provider, providerUser.id, userId, providerUser.email, providerUser.name, providerUser.avatar_url, env);
      }
    } else {
      if (existingIdentityUserId) {
        userId = existingIdentityUserId;
      } else {
        const existingUserByEmail = providerUser.email ? await getUserByEmail(providerUser.email, env) : null;

        if (existingUserByEmail) {
          userId = existingUserByEmail.id;
        } else {
          const createdUser = await createUser(
            crypto.randomUUID(),
            providerUser.email,
            providerUser.name,
            providerUser.avatar_url,
            env,
          );
          userId = createdUser.id;
        }

        await linkIdentity(provider, providerUser.id, userId, providerUser.email, providerUser.name, providerUser.avatar_url, env);
      }
    }

    await fillEmptyUserProfile(userId, providerUser, env);

    const session = await lucia.createSession(userId, {});

    const headers = new Headers({
      Location: "/dashboard",
    });

    clearOAuthCookies(headers, provider);
    setSessionCookie(headers, session.id, env);

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("OAuth Error:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const headers = new Headers();
    clearOAuthCookies(headers, provider);
    clearSessionCookie(headers, env);
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers });
  }
}
