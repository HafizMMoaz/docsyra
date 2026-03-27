import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { verifyTotpToken } from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  deleteBackupCodesByUser,
  getUserTwoFactorSettings,
  setUserTwoFactorEnabled,
  setUserTwoFactorSecret,
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
  if (!twoFactor?.enabled || !twoFactor.secret) {
    return Response.json({ success: false, error: "2FA is not enabled" }, { status: 400 });
  }

  const valid = await verifyTotpToken(twoFactor.secret, code);
  if (!valid) {
    return Response.json({ success: false, error: "Invalid code" }, { status: 400 });
  }

  await setUserTwoFactorEnabled(result.user.id, false, env);
  await setUserTwoFactorSecret(result.user.id, null, env);
  await deleteBackupCodesByUser(result.user.id, env);

  return Response.json({ success: true }, { status: 200 });
}
