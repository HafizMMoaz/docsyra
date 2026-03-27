import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import {
  generateBackupCodes,
  hashTwoFactorValue,
  verifyTotpToken,
} from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
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

  const twoFactor = await getUserTwoFactorSettings(result.user.id, env);
  if (!twoFactor?.secret) {
    return Response.json({ success: false, error: "Setup not initialized" }, { status: 400 });
  }

  const valid = await verifyTotpToken(twoFactor.secret, code);
  if (!valid) {
    return Response.json({ success: false, error: "Invalid code" }, { status: 400 });
  }

  const backupCodes = generateBackupCodes(8);
  const hashedCodes = await Promise.all(backupCodes.map((entry) => hashTwoFactorValue(entry)));

  await setUserTwoFactorEnabled(result.user.id, true, env);
  await replaceBackupCodes(result.user.id, hashedCodes, env);

  return Response.json({ success: true, backupCodes }, { status: 200 });
}
