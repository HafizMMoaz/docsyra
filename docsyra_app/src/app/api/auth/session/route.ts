import { clearSessionCookie, createLucia, setSessionCookie } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { setCsrfCookie } from "@/lib/security/csrf";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  setCsrfCookie();

  if (!sessionId) {
    return Response.json({ user: null }, { status: 200 });
  }

  const result = await lucia.validateSession(sessionId);
  const headers = new Headers();

  if (!result.session || !result.user) {
    clearSessionCookie(headers, env);
    return Response.json({ user: null }, { status: 200, headers });
  }

  if (result.session.fresh) {
    setSessionCookie(headers, result.session.id, env);
  }

  return Response.json(
    {
      user: {
        id: result.user.id,
        email: result.user.email,
        email_verified: result.user.email_verified,
        name: result.user.name,
        avatar_url: result.user.avatar_url,
        status: result.user.status,
        profession: result.user.profession,
        industry: result.user.industry,
        country: result.user.country,
      },
    },
    { status: 200, headers },
  );
}
