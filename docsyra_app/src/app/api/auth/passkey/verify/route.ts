import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import {
  clearPasskeyChallengeCookie,
  verifyPasskeyRegistration,
} from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { createPasskeyRecord } from "@/lib/db/queries";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const runtime = "edge";

type Body = {
  response?: unknown;
};

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!body.response || typeof body.response !== "object") {
    return Response.json({ success: false, error: "Passkey response is required" }, { status: 400 });
  }

  const verification = await verifyPasskeyRegistration({
    request,
    response: body.response as RegistrationResponseJSON,
    env,
  });

  if (!verification.verified || verification.userId !== result.user.id) {
    return Response.json({ success: false, error: "Passkey verification failed" }, { status: 400 });
  }

  await createPasskeyRecord(
    {
      userId: verification.userId,
      credentialId: verification.credentialId,
      publicKey: verification.publicKey,
      counter: verification.counter,
      transports: verification.transports,
    },
    env,
  );

  const headers = new Headers();
  headers.append("Set-Cookie", clearPasskeyChallengeCookie());

  return Response.json({ success: true }, { status: 200, headers });
}
