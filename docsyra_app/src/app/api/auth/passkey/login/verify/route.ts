import { createSession } from "@/lib/auth";
import { verifyPasskeyLogin } from "@/lib/auth/passkeys";
import { createTwoFactorChallengeCookie } from "@/lib/auth/two-factor";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  deletePasskeyChallengeById,
  getPasskeyChallengeByUserId,
  getPasskeyByCredentialId,
  getUserById,
  getUserTwoFactorSettings,
  updatePasskeyCounter,
} from "@/lib/db/queries";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const runtime = "edge";

type Body = {
  response?: unknown;
};

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

  if (!body.response || typeof body.response !== "object") {
    return Response.json({ success: false, error: "Passkey response is required" }, { status: 400 });
  }

  const response = body.response as AuthenticationResponseJSON;
  const credentialId = response.id;
  if (!credentialId) {
    return Response.json({ success: false, error: "Credential ID is missing" }, { status: 400 });
  }

  const env = getEnv(context);
  const passkey = await getPasskeyByCredentialId(credentialId, env);
  if (!passkey) {
    return Response.json({ success: false, error: "Passkey not found" }, { status: 404 });
  }

  const challenge = await getPasskeyChallengeByUserId(passkey.userId, env);
  if (!challenge) {
    return Response.json({ success: false, error: "Passkey challenge not found" }, { status: 404 });
  }

  if (challenge.expires_at <= Date.now()) {
    await deletePasskeyChallengeById(challenge.id, env);
    return Response.json({ success: false, error: "Passkey challenge expired" }, { status: 400 });
  }

  await deletePasskeyChallengeById(challenge.id, env);

  const verification = await verifyPasskeyLogin({
    response,
    expectedChallenge: challenge.challenge,
    credentialPublicKey: passkey.publicKey,
    credentialId: passkey.credentialId,
    counter: passkey.counter,
    transports: passkey.transports,
    env,
  });

  if (!verification.verified) {
    return Response.json({ success: false, error: "Passkey verification failed" }, { status: 401 });
  }

  await updatePasskeyCounter(passkey.id, verification.newCounter, env);

  const user = await getUserById(passkey.userId, env);
  if (!user) {
    return Response.json({ success: false, error: "User mismatch" }, { status: 401 });
  }

  const twoFactor = await getUserTwoFactorSettings(user.id, env);
  if (twoFactor?.enabled) {
    const headers = new Headers();
    headers.append("Set-Cookie", createTwoFactorChallengeCookie(user.id));

    return Response.json({ success: true, requiresTwoFactor: true }, { status: 200, headers });
  }

  const sessionResult = await createSession(user.id, env, request);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionResult.setCookie);

  return Response.json(
    {
      success: true,
      user: {
        id: sessionResult.user.id,
        email: sessionResult.user.email,
        status: sessionResult.user.status,
      },
    },
    { status: 200, headers },
  );
}
