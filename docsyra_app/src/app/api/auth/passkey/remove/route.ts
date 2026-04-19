import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { deletePasskeyById } from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  passkeyId?: unknown;
};

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
      route: "passkey",
    });
  } catch {
    return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const passkeyId = typeof body.passkeyId === "string" ? body.passkeyId.trim() : "";
  if (!passkeyId) {
    return Response.json({ success: false, error: "passkeyId is required" }, { status: 400 });
  }

  await deletePasskeyById(passkeyId, result.user.id, env);

  return Response.json({ success: true }, { status: 200 });
}
