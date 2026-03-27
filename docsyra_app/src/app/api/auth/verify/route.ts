import { getEnv } from "@/lib/cloudflare/route-context";
import {
  deleteEmailVerificationTokenByToken,
  getEmailVerificationToken,
  updateUserEmailVerified,
} from "@/lib/db/queries";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return Response.json({ success: false, error: "Invalid token" }, { status: 400 });
  }

  const tokenRecord = await getEmailVerificationToken(token, env);
  if (!tokenRecord || tokenRecord.expires_at <= Date.now()) {
    await deleteEmailVerificationTokenByToken(token, env);
    return Response.json({ success: false, error: "Token is invalid or expired" }, { status: 400 });
  }

  await updateUserEmailVerified(tokenRecord.user_id, true, env);
  await deleteEmailVerificationTokenByToken(token, env);

  return Response.redirect(new URL("/dashboard", request.url), 302);
}
