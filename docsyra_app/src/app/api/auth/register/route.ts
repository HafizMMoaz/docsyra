import { createUser, createLucia, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { getSessionClientMetadata } from "@/lib/auth/session-metadata";
import { maybeAlertSuspiciousSession } from "@/lib/auth/session-risk";
import { createExpiry, createSecureToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf, setCsrfCookie } from "@/lib/security/csrf";
import {
  acceptPendingDocumentInvitationsForUser,
  createEmailVerificationToken,
  deleteEmailVerificationTokensByUser,
  getUserPasswordHashByEmail,
  updateSessionClientMetadata,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { verifyEmailTemplate } from "@/lib/email/templates";

export const runtime = "edge";

type Body = {
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
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
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
      return Response.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const env = getEnv(context);
    const existing = await getUserPasswordHashByEmail(emailValue, env);

    if (existing) {
      return Response.json(
        { success: false, error: "Account already exists. Continue with email and enter password." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(passwordValue);
    const user = await createUser(
      crypto.randomUUID(),
      emailValue,
      null,
      null,
      "incomplete",
      null,
      null,
      null,
      env,
      passwordHash,
    );

    await acceptPendingDocumentInvitationsForUser(user.id, emailValue, env);

    const verifyToken = createSecureToken();
    const verifyExpiresAt = createExpiry(30);
    await deleteEmailVerificationTokensByUser(user.id, env);
    await createEmailVerificationToken(user.id, verifyToken, verifyExpiresAt, env);

    const appBase =
      (typeof env?.NEXT_PUBLIC_APP_URL === "string" && env.NEXT_PUBLIC_APP_URL.trim()) ||
      (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
      new URL(request.url).origin;
    const verifyLink = `${appBase.replace(/\/+$/, "")}/api/auth/verify?token=${encodeURIComponent(verifyToken)}`;

    try {
      await sendEmail(
        {
          to: emailValue,
          subject: "Verify your Docsyra email",
          html: verifyEmailTemplate(verifyLink),
        },
        env,
      );
    } catch (error) {
      console.error("[email][register] Failed to send verification email", error);
    }

    const lucia = createLucia(env);
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
    setCsrfCookie();

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.attributes.email,
          status: user.attributes.status,
        },
      },
      { status: 201, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
