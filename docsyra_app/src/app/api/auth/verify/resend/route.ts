import { validateSession } from "@/lib/auth";
import { createExpiry, createSecureToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import {
  createEmailVerificationToken,
  deleteEmailVerificationTokensByUser,
  isUserEmailVerified,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { verifyEmailTemplate } from "@/lib/email/templates";

export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const sessionResult = await validateSession(request, env);

  if (!sessionResult.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const email = sessionResult.user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return Response.json({ success: false, error: "No email found for current user" }, { status: 400 });
  }

  const alreadyVerified = await isUserEmailVerified(sessionResult.user.id, env);
  if (alreadyVerified) {
    return Response.json({ success: true, alreadyVerified: true }, { status: 200 });
  }

  const token = createSecureToken();
  const expiresAt = createExpiry(30);
  await deleteEmailVerificationTokensByUser(sessionResult.user.id, env);
  await createEmailVerificationToken(sessionResult.user.id, token, expiresAt, env);

  const appBase =
    (typeof env?.NEXT_PUBLIC_APP_URL === "string" && env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    new URL(request.url).origin;
  const verifyLink = `${appBase.replace(/\/+$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;

  await sendEmail(
    {
      to: email,
      subject: "Verify your Docsyra email",
      html: verifyEmailTemplate(verifyLink),
    },
    env,
  );

  return Response.json({ success: true }, { status: 200 });
}
