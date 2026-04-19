import { createLucia } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { rejectCsrf } from "@/lib/security/csrf";
import { disconnectUserAuthIdentity } from "@/lib/db/queries";

export const runtime = "edge";

type Provider = "google" | "github";

type DisconnectBody = {
  provider?: unknown;
};

function asProvider(value: unknown): Provider | null {
  if (value === "google" || value === "github") {
    return value;
  }

  return null;
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
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: DisconnectBody;

  try {
    body = (await request.json()) as DisconnectBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const provider = asProvider(body.provider);
  if (!provider) {
    return Response.json({ success: false, error: "Invalid provider" }, { status: 400 });
  }

  await disconnectUserAuthIdentity(result.user.id, provider, env);

  return Response.json({ success: true }, { status: 200 });
}
