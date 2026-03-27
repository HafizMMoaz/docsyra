import { createSession } from "@/lib/auth";
import { hashOtpCode } from "@/lib/auth/otp";
import { createTwoFactorChallengeCookie } from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  createUser,
  deleteEmailOtpCodeById,
  getLatestEmailOtpCodeByEmail,
  getUserByEmail,
  getUserTwoFactorSettings,
  incrementEmailOtpAttempts,
  updateUserEmailVerified,
} from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  email?: unknown;
  code?: unknown;
};

const GENERIC_ERROR = "Invalid or expired code";

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
    return Response.json({ success: false, error: GENERIC_ERROR }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return Response.json({ success: false, error: GENERIC_ERROR }, { status: 400 });
  }

  const env = getEnv(context);
  const otp = await getLatestEmailOtpCodeByEmail(email, env);

  if (!otp || otp.expires_at <= Date.now() || otp.attempts >= 5) {
    if (otp && otp.expires_at <= Date.now()) {
      await deleteEmailOtpCodeById(otp.id, env);
    }
    return Response.json({ success: false, error: GENERIC_ERROR }, { status: 400 });
  }

  const codeHash = await hashOtpCode(code);

  if (otp.code_hash !== codeHash) {
    await incrementEmailOtpAttempts(otp.id, env);
    return Response.json({ success: false, error: GENERIC_ERROR }, { status: 400 });
  }

  await deleteEmailOtpCodeById(otp.id, env);

  let user = await getUserByEmail(email, env);
  if (!user) {
    user = await createUser(crypto.randomUUID(), email, null, null, "incomplete", null, null, null, env, null);
  }

  await updateUserEmailVerified(user.id, true, env);

  const twoFactor = await getUserTwoFactorSettings(user.id, env);
  if (twoFactor?.enabled) {
    const headers = new Headers();
    headers.append("Set-Cookie", createTwoFactorChallengeCookie(user.id));

    return Response.json({ success: true, requiresTwoFactor: true }, { status: 200, headers });
  }

  const sessionResult = await createSession(user.id, env, request);
  const headers = new Headers();
  headers.set("Set-Cookie", sessionResult.setCookie);

  return Response.json(
    {
      success: true,
      user: {
        id: sessionResult.user.id,
        email: sessionResult.user.email,
        status: sessionResult.user.status,
      },
    },
    { status: 200, headers },
  );
}
