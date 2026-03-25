import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { createDocument } from "@/lib/db/queries";

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
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const document = await createDocument(result.user.id, env);

  return Response.json({ success: true, id: document.id }, { status: 201 });
}
