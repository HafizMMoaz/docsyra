import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { createPasskeyRegistrationOptions } from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { createPasskeyChallenge, getPasskeysByUserId } from "@/lib/db/queries";
import { PASSKEY_CHALLENGE_TTL_MS } from "@/lib/auth/passkeys";

export const runtime = "edge";

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
  if (!result.session || !result.user || !result.user.email) {
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

  const existing = await getPasskeysByUserId(result.user.id, env);

  const passkey = await createPasskeyRegistrationOptions({
    userId: result.user.id,
    email: result.user.email,
    existingCredentialIds: existing.map((entry) => entry.credentialId),
    env,
  });

  await createPasskeyChallenge(
    {
      userId: result.user.id,
      challenge: passkey.options.challenge,
      expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
    },
    env,
  );

  return Response.json(
    {
      success: true,
      options: passkey.options,
    },
    { status: 200 },
  );
}
