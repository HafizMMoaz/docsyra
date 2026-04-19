import { createPasskeyLoginOptions } from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { createPasskeyChallenge, getPasskeysByUserId, getUserByEmail } from "@/lib/db/queries";
import { PASSKEY_CHALLENGE_TTL_MS } from "@/lib/auth/passkeys";

export const runtime = "edge";

type Body = {
  email?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  try {
    await rateLimit(request, null, {
      limit: 5,
      windowMs: 60_000,
      route: "passkey",
    });
  } catch {
    return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
  }

  const env = getEnv(context);
  const user = await getUserByEmail(email, env);
  if (!user) {
    return Response.json({ success: false, error: "No passkeys found for this account" }, { status: 404 });
  }

  const passkeys = await getPasskeysByUserId(user.id, env);
  if (passkeys.length === 0) {
    return Response.json({ success: false, error: "No passkeys found for this account" }, { status: 404 });
  }

  const loginOptions = await createPasskeyLoginOptions({
    credentialIds: passkeys.map((entry) => entry.credentialId),
    env,
  });

  await createPasskeyChallenge(
    {
      userId: user.id,
      challenge: loginOptions.options.challenge,
      expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
    },
    env,
  );

  return Response.json(
    {
      success: true,
      options: loginOptions.options,
    },
    { status: 200 },
  );
}
