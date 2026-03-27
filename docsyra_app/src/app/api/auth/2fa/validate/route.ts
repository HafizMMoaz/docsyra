import { createSession } from "@/lib/auth";
import {
  clearTwoFactorChallengeCookie,
  hashTwoFactorValue,
  readTwoFactorChallenge,
  verifyTotpToken,
} from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  consumeBackupCode,
  getUserTwoFactorSettings,
} from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  code?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return Response.json({ success: false, error: "Code is required" }, { status: 400 });
  }

  const challenge = readTwoFactorChallenge(request);
  if (!challenge) {
    return Response.json({ success: false, error: "2FA challenge expired" }, { status: 401 });
  }

  const env = getEnv(context);
  const twoFactor = await getUserTwoFactorSettings(challenge.userId, env);

  if (!twoFactor?.enabled || !twoFactor.secret) {
    return Response.json({ success: false, error: "2FA is not enabled" }, { status: 400 });
  }

  const totpValid = /^\d{6}$/.test(code) ? await verifyTotpToken(twoFactor.secret, code) : false;
  let backupValid = false;

  if (!totpValid) {
    const hashed = await hashTwoFactorValue(code);
    backupValid = await consumeBackupCode(challenge.userId, hashed, env);
  }

  if (!totpValid && !backupValid) {
    return Response.json({ success: false, error: "Invalid verification code" }, { status: 400 });
  }

  const sessionResult = await createSession(challenge.userId, env, request);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionResult.setCookie);
  headers.append("Set-Cookie", clearTwoFactorChallengeCookie());

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
