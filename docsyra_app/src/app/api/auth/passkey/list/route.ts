import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getPasskeysByUserId } from "@/lib/db/queries";

export const runtime = "edge";

export async function GET(
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
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await getPasskeysByUserId(result.user.id, env);

  return Response.json(
    {
      success: true,
      passkeys: passkeys.map((entry) => ({
        id: entry.id,
        credentialIdSuffix: entry.credentialId.slice(-12),
        createdAt: entry.createdAt,
      })),
    },
    { status: 200 },
  );
}
