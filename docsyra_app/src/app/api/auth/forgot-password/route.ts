import { createExpiry, createSecureToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  createPasswordResetToken,
  deletePasswordResetTokensByUser,
  getUserByEmail,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { resetPasswordTemplate } from "@/lib/email/templates";

export const runtime = "edge";

type Body = {
  email?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: true }, { status: 200 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return Response.json({ success: true }, { status: 200 });
  }

  const env = getEnv(context);
  const user = await getUserByEmail(email, env);

  if (!user?.id || !user.attributes.email) {
    return Response.json({ success: true }, { status: 200 });
  }

  const token = createSecureToken();
  const expiresAt = createExpiry(30);

  await deletePasswordResetTokensByUser(user.id, env);
  await createPasswordResetToken(user.id, token, expiresAt, env);

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://docsyra.app";
  const resetLink = `${appBase.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendEmail(
      {
        to: user.attributes.email,
        subject: "Reset your Docsyra password",
        html: resetPasswordTemplate(resetLink),
      },
      env,
    );
  } catch (error) {
    console.error("[email][forgot-password] Failed to send reset email", error);
  }

  return Response.json({ success: true }, { status: 200 });
}
