import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import {
  generateBackupCodes,
  hashTwoFactorValue,
  decryptSecret,
  verifyTotpToken,
} from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  getUserTwoFactorSettings,
  replaceBackupCodes,
  setUserTwoFactorEnabled,
} from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  code?: unknown;
};

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

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ success: false, error: "Invalid code" }, { status: 400 });
  }

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

  try {
    await rateLimit(request, result.user.id, {
      limit: 5,
      windowMs: 60_000,
      route: "2fa",
    });
  } catch {
    return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const twoFactor = await getUserTwoFactorSettings(result.user.id, env);
  if (!twoFactor?.secret) {
    return Response.json({ success: false, error: "Setup not initialized" }, { status: 400 });
  }

  const decrypted = await decryptSecret(twoFactor.secret);
  const valid = await verifyTotpToken(decrypted, code);
  if (!valid) {
    return Response.json({ success: false, error: "Invalid code" }, { status: 400 });
  }

  const backupCodes = generateBackupCodes(8);
  const hashedCodes = await Promise.all(backupCodes.map((entry) => hashTwoFactorValue(entry)));

  await setUserTwoFactorEnabled(result.user.id, true, env);
  await replaceBackupCodes(result.user.id, hashedCodes, env);

  return Response.json({ success: true, backupCodes }, { status: 200 });
}
