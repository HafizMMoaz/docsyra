import { getOtpExpiry, generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  checkAndIncrementRateLimit,
  createEmailOtpCode,
  deleteEmailOtpCodesByEmail,
  getLatestEmailOtpCodeByEmail,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";

export const runtime = "edge";

type Body = {
  email?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: true }, { status: 200 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return Response.json({ success: true }, { status: 200 });
  }

  const env = getEnv(context);
  const ip = getClientIp(request);

  const emailLimit = await checkAndIncrementRateLimit(`otp:email:${email}`, 60_000, 5, env);
  const ipLimit = await checkAndIncrementRateLimit(`otp:ip:${ip}`, 60_000, 5, env);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    return Response.json({ success: true }, { status: 200 });
  }

  const latestOtp = await getLatestEmailOtpCodeByEmail(email, env);
  if (latestOtp && Date.now() - latestOtp.created_at < 30_000) {
    return Response.json({ success: true }, { status: 200 });
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const now = Date.now();
  const expiresAt = getOtpExpiry();

  await deleteEmailOtpCodesByEmail(email, env);
  await createEmailOtpCode(email, codeHash, expiresAt, now, env);

  try {
    await sendEmail(
      {
        to: email,
        subject: "Your Docsyra login code",
        html: `<div style="font-family: Arial, sans-serif; color: #0f172a;"><p>Your code is: <strong>${code}</strong></p><p>This code expires in 5 minutes.</p></div>`,
      },
      env,
    );
  } catch (error) {
    console.error("[email][otp] Failed to send OTP email", error);
  }

  return Response.json({ success: true }, { status: 200 });
}
