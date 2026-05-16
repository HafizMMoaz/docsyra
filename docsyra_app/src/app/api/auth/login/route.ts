import { createLucia, setSessionCookie } from "@/lib/auth";
import { getSessionClientMetadata } from "@/lib/auth/session-metadata";
import { maybeAlertSuspiciousSession } from "@/lib/auth/session-risk";
import { verifyPassword } from "@/lib/auth/password";
import { createTwoFactorChallengeCookie } from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf, setCsrfCookie } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  acceptPendingDocumentInvitationsForUser,
  getUserByEmail,
  getUserPasswordHashByEmail,
  getUserTwoFactorSettings,
  updateSessionClientMetadata,
} from "@/lib/db/queries";

export const runtime = "edge";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  try {
    await rateLimit(request, null, {
      limit: 5,
      windowMs: 60_000,
      route: "login",
    });
  } catch {
    return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const emailValue = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const passwordValue = typeof body.password === "string" ? body.password : "";

    if (!emailValue || !isValidEmail(emailValue)) {
      return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
    }

    if (passwordValue.length < 8) {
      return Response.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const env = getEnv(context);
    const lucia = createLucia(env);

    const user = await getUserByEmail(emailValue, env);
    if (!user) {
      return Response.json({ success: false, error: "Account not found. Continue with email to create one." }, { status: 404 });
    }

    const credentials = await getUserPasswordHashByEmail(emailValue, env);

    if (!credentials?.password_hash) {
      return Response.json(
        {
          success: false,
          error: "This account uses social login. Continue with Google/GitHub.",
        },
        { status: 403 },
      );
    }

    const validPassword = await verifyPassword(passwordValue, credentials.password_hash);
    if (!validPassword) {
      return Response.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    await acceptPendingDocumentInvitationsForUser(user.id, user.attributes.email, env);

    const twoFactor = await getUserTwoFactorSettings(user.id, env);
    if (twoFactor?.enabled) {
      const headers = new Headers();
      headers.append("Set-Cookie", createTwoFactorChallengeCookie(user.id));
      await setCsrfCookie();

      return Response.json({ success: true, requiresTwoFactor: true }, { status: 200, headers });
    }

    const session = await lucia.createSession(user.id, {});
    const metadata = getSessionClientMetadata(request);
    await updateSessionClientMetadata(session.id, metadata, env);
    await maybeAlertSuspiciousSession({
      userId: user.id,
      userEmail: user.attributes.email,
      sessionId: session.id,
      metadata,
      env,
    });

    const headers = new Headers();
    setSessionCookie(headers, session.id, env);
    await setCsrfCookie();

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.attributes.email,
          name: user.attributes.name,
          avatar_url: user.attributes.avatar_url,
          status: user.attributes.status,
          profession: user.attributes.profession,
          industry: user.attributes.industry,
          country: user.attributes.country,
        },
      },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
