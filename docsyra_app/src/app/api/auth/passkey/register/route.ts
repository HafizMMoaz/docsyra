import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { createPasskeyRegistrationOptions } from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getPasskeysByUserId } from "@/lib/db/queries";

export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user || !result.user.email) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getPasskeysByUserId(result.user.id, env);

  const passkey = await createPasskeyRegistrationOptions({
    userId: result.user.id,
    email: result.user.email,
    existingCredentialIds: existing.map((entry) => entry.credentialId),
    env,
  });

  const headers = new Headers();
  headers.append("Set-Cookie", passkey.setCookie);

  return Response.json(
    {
      success: true,
      options: passkey.options,
    },
    { status: 200, headers },
  );
}
