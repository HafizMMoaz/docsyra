import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import {
  generateOtpAuthUrl,
  generateTwoFactorSecret,
} from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import {
  getUserById,
  getUserTwoFactorSettings,
  setUserTwoFactorSecret,
} from "@/lib/db/queries";

export const runtime = "edge";

async function requireUser(
  request: Request,
  env: any,
): Promise<{ id: string; email: string | null } | Response> {
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return { id: result.user.id, email: result.user.email };
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const twoFactor = await getUserTwoFactorSettings(auth.id, env);
  return Response.json(
    {
      success: true,
      twoFactorEnabled: twoFactor?.enabled ?? false,
    },
    { status: 200 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const twoFactor = await getUserTwoFactorSettings(auth.id, env);
  if (twoFactor?.enabled) {
    return Response.json({ success: false, error: "2FA is already enabled" }, { status: 409 });
  }

  const secret = generateTwoFactorSecret();
  await setUserTwoFactorSecret(auth.id, secret, env);

  const user = await getUserById(auth.id, env);
  const email = user?.attributes.email ?? auth.email ?? `${auth.id}@docsyra.local`;
  const otpauthUrl = generateOtpAuthUrl(email, secret);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`;

  return Response.json(
    {
      success: true,
      secret,
      otpauthUrl,
      qrCodeUrl,
    },
    { status: 200 },
  );
}
