import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { verifyPasskeyRegistration } from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  createPasskeyRecord,
  deletePasskeyChallengeById,
  getPasskeyChallengeByUserId,
} from "@/lib/db/queries";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const runtime = "edge";

type Body = {
  response?: unknown;
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

  if (!body.response || typeof body.response !== "object") {
    return Response.json({ success: false, error: "Passkey response is required" }, { status: 400 });
  }

  const challenge = await getPasskeyChallengeByUserId(result.user.id, env);
  if (!challenge) {
    return Response.json({ success: false, error: "Passkey challenge not found" }, { status: 404 });
  }

  if (challenge.expires_at <= Date.now()) {
    await deletePasskeyChallengeById(challenge.id, env);
    return Response.json({ success: false, error: "Passkey challenge expired" }, { status: 400 });
  }

  await deletePasskeyChallengeById(challenge.id, env);

  const verification = await verifyPasskeyRegistration({
    response: body.response as RegistrationResponseJSON,
    expectedChallenge: challenge.challenge,
    env,
  });

  if (!verification.verified) {
    return Response.json({ success: false, error: "Passkey verification failed" }, { status: 400 });
  }

  await createPasskeyRecord(
    {
      userId: result.user.id,
      credentialId: verification.credentialId,
      publicKey: verification.publicKey,
      counter: verification.counter,
      transports: verification.transports,
    },
    env,
  );

  return Response.json({ success: true }, { status: 200 });
}
