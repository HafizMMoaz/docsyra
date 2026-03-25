import { createLucia } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getUserAuthIdentities } from "@/lib/db/queries";

export const runtime = "edge";

type Provider = "google" | "github";

type IdentityStatus = {
  provider: Provider;
  connected: boolean;
  email: string | null;
  avatar_url: string | null;
};

function buildIdentityState(
  identities: Array<{ provider: string; email: string | null; avatar_url: string | null }>,
): Record<Provider, IdentityStatus> {
  const state: Record<Provider, IdentityStatus> = {
    google: { provider: "google", connected: false, email: null, avatar_url: null },
    github: { provider: "github", connected: false, email: null, avatar_url: null },
  };

  for (const identity of identities) {
    if (identity.provider !== "google" && identity.provider !== "github") {
      continue;
    }

    const existing = state[identity.provider];
    const hasExistingEmail = typeof existing.email === "string" && existing.email.length > 0;
    const hasIdentityEmail = typeof identity.email === "string" && identity.email.length > 0;
    const hasExistingAvatar = typeof existing.avatar_url === "string" && existing.avatar_url.length > 0;
    const hasIdentityAvatar = typeof identity.avatar_url === "string" && identity.avatar_url.length > 0;

    if (!existing.connected || (!hasExistingEmail && hasIdentityEmail) || (!hasExistingAvatar && hasIdentityAvatar)) {
      state[identity.provider] = {
        provider: identity.provider,
        connected: true,
        email: identity.email ?? null,
        avatar_url: identity.avatar_url ?? null,
      };
    }
  }

  return state;
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const identities = await getUserAuthIdentities(result.user.id, env);
  const status = buildIdentityState(identities);

  return Response.json(
    {
      success: true,
      accounts: [status.google, status.github],
    },
    { status: 200 },
  );
}
