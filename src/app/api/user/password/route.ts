import { createLucia } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { updateUserPassword } from "@/lib/db/queries";

export const runtime = "edge";

type PasswordBody = {
  password?: unknown;
};

export async function PUT(
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

  let body: PasswordBody;

  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return Response.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(result.user.id, passwordHash, env);

  return Response.json({ success: true }, { status: 200 });
}
