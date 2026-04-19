import { clearSessionCookie, createLucia } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { rejectCsrf } from "@/lib/security/csrf";

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
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }

  const headers = new Headers();
  clearSessionCookie(headers, env);

  return Response.json({ success: true }, { status: 200, headers });
}
