import { getEnv } from "@/lib/cloudflare/route-context";
import {
  deleteEmailVerificationTokenByToken,
  getEmailVerificationToken,
  getUserById,
  updateUserEmailVerified,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { welcomeEmailTemplate } from "@/lib/email/templates";

export const runtime = "edge";

function redirectTo(path: string, request: Request): Response {
  const headers = new Headers();
  headers.set("Location", new URL(path, request.url).toString());
  return new Response(null, { status: 302, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim() ?? "";

    if (!token) {
      return redirectTo("/verify/invalid", request);
    }

    const tokenRecord = await getEmailVerificationToken(token, env);
    if (!tokenRecord || tokenRecord.expires_at <= Date.now()) {
      await deleteEmailVerificationTokenByToken(token, env);
      return redirectTo("/verify/invalid", request);
    }

    await updateUserEmailVerified(tokenRecord.user_id, true, env);
    await deleteEmailVerificationTokenByToken(token, env);

    try {
      const user = await getUserById(tokenRecord.user_id, env);
      if (user?.attributes.email) {
        const appBase =
          (typeof env?.NEXT_PUBLIC_APP_URL === "string" && env.NEXT_PUBLIC_APP_URL.trim()) ||
          (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
          new URL(request.url).origin;
        const dashboardLink = `${appBase.replace(/\/+$/, "")}/dashboard`;

        await sendEmail(
          {
            to: user.attributes.email,
            subject: "Welcome to Docsyra",
            html: welcomeEmailTemplate(dashboardLink),
          },
          env,
        );
      }
    } catch (error) {
      console.error("[email][welcome] Failed to send welcome email", error);
    }

    return redirectTo("/verify/success", request);
  } catch (error) {
    console.error("[auth][verify] Failed to verify email token", error);
    return redirectTo("/verify/invalid", request);
  }
}
