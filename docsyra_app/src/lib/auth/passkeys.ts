import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { DbEnv } from "@/lib/db/client";

type ChallengePayload = {
  type: "register" | "login";
  challenge: string;
  userId?: string;
  email?: string;
  exp: number;
};

const PASSKEY_CHALLENGE_COOKIE = "docsyra_passkey_challenge";
const PASSKEY_CHALLENGE_TTL_SECONDS = 300;

function toBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized);
}

function serializeCookie(name: string, value: string, options?: { maxAge?: number }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure"];

  if (typeof options?.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join("; ");
}

function resolvePasskeyConfig(env?: DbEnv): { rpID: string; origin: string; rpName: string } {
  const rpID =
    env?.PASSKEY_RP_ID?.trim() ||
    process.env.PASSKEY_RP_ID?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/^https?:\/\//, "") ||
    "localhost";

  const origin =
    env?.PASSKEY_ORIGIN?.trim() ||
    process.env.PASSKEY_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";

  const rpName =
    env?.PASSKEY_RP_NAME?.trim() ||
    process.env.PASSKEY_RP_NAME?.trim() ||
    "Docsyra";

  return { rpID, origin, rpName };
}

function toUint8Array(base64url: string): ReturnType<Uint8Array["slice"]> {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64url, "base64url")).slice();
  }

  const normalized = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.slice();
}

function fromUint8Array(value: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64url");
  }

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readChallengeCookie(request: Request): ChallengePayload | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PASSKEY_CHALLENGE_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!token) {
    return null;
  }

  try {
    const decoded = fromBase64Url(decodeURIComponent(token));
    const payload = JSON.parse(decoded) as ChallengePayload;

    if (!payload.challenge || !payload.type || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function setChallengeCookie(payload: ChallengePayload): string {
  return serializeCookie(PASSKEY_CHALLENGE_COOKIE, toBase64Url(JSON.stringify(payload)), {
    maxAge: PASSKEY_CHALLENGE_TTL_SECONDS,
  });
}

export function clearPasskeyChallengeCookie(): string {
  return serializeCookie(PASSKEY_CHALLENGE_COOKIE, "", { maxAge: 0 });
}

export async function createPasskeyRegistrationOptions(input: {
  userId: string;
  email: string;
  existingCredentialIds: string[];
  env?: DbEnv;
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; setCookie: string }> {
  const config = resolvePasskeyConfig(input.env);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: input.email,
    userID: new TextEncoder().encode(input.userId),
    userDisplayName: input.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: input.existingCredentialIds.map((credentialId) => ({
      id: credentialId,
      type: "public-key",
    })),
  });

  const setCookie = setChallengeCookie({
    type: "register",
    challenge: options.challenge,
    userId: input.userId,
    email: input.email,
    exp: Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
  });

  return { options, setCookie };
}

export async function verifyPasskeyRegistration(input: {
  request: Request;
  response: RegistrationResponseJSON;
  env?: DbEnv;
}): Promise<{
  verified: boolean;
  userId: string;
  email: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
}> {
  const challenge = readChallengeCookie(input.request);
  if (!challenge || challenge.type !== "register" || !challenge.userId || !challenge.email) {
    throw new Error("Registration challenge expired");
  }

  const config = resolvePasskeyConfig(input.env);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return {
      verified: false,
      userId: challenge.userId,
      email: challenge.email,
      credentialId: "",
      publicKey: "",
      counter: 0,
      transports: [],
    };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const transports = (input.response.response.transports ?? []) as AuthenticatorTransportFuture[];

  return {
    verified: true,
    userId: challenge.userId,
    email: challenge.email,
    credentialId: credential.id,
    publicKey: fromUint8Array(credential.publicKey),
    counter: credential.counter,
    transports: [...transports, `device:${credentialDeviceType}`, `backup:${credentialBackedUp ? "yes" : "no"}`],
  };
}

export async function createPasskeyLoginOptions(input: {
  email: string;
  credentialIds: string[];
  env?: DbEnv;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; setCookie: string }> {
  const config = resolvePasskeyConfig(input.env);

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "preferred",
    allowCredentials: input.credentialIds.map((credentialId) => ({
      id: credentialId,
      type: "public-key",
    })),
  });

  const setCookie = setChallengeCookie({
    type: "login",
    challenge: options.challenge,
    email: input.email,
    exp: Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
  });

  return { options, setCookie };
}

export async function verifyPasskeyLogin(input: {
  request: Request;
  response: AuthenticationResponseJSON;
  credentialPublicKey: string;
  credentialId: string;
  counter: number;
  transports: string[];
  env?: DbEnv;
}): Promise<{ verified: boolean; newCounter: number; email: string }> {
  const challenge = readChallengeCookie(input.request);
  if (!challenge || challenge.type !== "login" || !challenge.email) {
    throw new Error("Login challenge expired");
  }

  const config = resolvePasskeyConfig(input.env);

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
    credential: {
      id: input.credentialId,
      publicKey: toUint8Array(input.credentialPublicKey),
      counter: input.counter,
      transports: input.transports as AuthenticatorTransportFuture[],
    },
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return { verified: false, newCounter: input.counter, email: challenge.email };
  }

  const newCounter = verification.authenticationInfo.newCounter;

  if (newCounter <= input.counter) {
    return { verified: false, newCounter: input.counter, email: challenge.email };
  }

  return { verified: true, newCounter, email: challenge.email };
}
