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

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

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

export async function createPasskeyRegistrationOptions(input: {
  userId: string;
  email: string;
  existingCredentialIds: string[];
  env?: DbEnv;
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON }> {
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

  return { options };
}

export async function verifyPasskeyRegistration(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  env?: DbEnv;
}): Promise<{
  verified: boolean;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
}> {
  const config = resolvePasskeyConfig(input.env);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return {
      verified: false,
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
    credentialId: credential.id,
    publicKey: fromUint8Array(credential.publicKey),
    counter: credential.counter,
    transports: [...transports, `device:${credentialDeviceType}`, `backup:${credentialBackedUp ? "yes" : "no"}`],
  };
}

export async function createPasskeyLoginOptions(input: {
  credentialIds: string[];
  env?: DbEnv;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
  const config = resolvePasskeyConfig(input.env);

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "preferred",
    allowCredentials: input.credentialIds.map((credentialId) => ({
      id: credentialId,
      type: "public-key",
    })),
  });

  return { options };
}

export async function verifyPasskeyLogin(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credentialPublicKey: string;
  credentialId: string;
  counter: number;
  transports: string[];
  env?: DbEnv;
}): Promise<{ verified: boolean; newCounter: number }> {
  const config = resolvePasskeyConfig(input.env);

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
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
    return { verified: false, newCounter: input.counter };
  }

  const newCounter = verification.authenticationInfo.newCounter;

  if (newCounter <= input.counter) {
    return { verified: false, newCounter: input.counter };
  }

  return { verified: true, newCounter };
}
