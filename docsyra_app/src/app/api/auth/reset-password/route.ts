import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  deletePasswordResetTokenByToken,
  deletePasswordResetTokensByUser,
  getPasswordResetToken,
  updateUserPassword,
} from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  token?: unknown;
  password?: unknown;
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

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    return Response.json({ success: false, error: "Token is required" }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const env = getEnv(context);
  const tokenRecord = await getPasswordResetToken(token, env);

  if (!tokenRecord || tokenRecord.expires_at <= Date.now()) {
    await deletePasswordResetTokenByToken(token, env);
    return Response.json({ success: false, error: "Token is invalid or expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(tokenRecord.user_id, passwordHash, env);
  await deletePasswordResetTokenByToken(token, env);
  await deletePasswordResetTokensByUser(tokenRecord.user_id, env);

  return Response.json({ success: true }, { status: 200 });
}
