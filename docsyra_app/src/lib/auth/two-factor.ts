import { generateSecret, generateURI, verify } from "otplib";

const TWO_FACTOR_CHALLENGE_COOKIE = "docsyra_2fa_challenge";
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;

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

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64url"));
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function xorWithKey(input: Uint8Array, key: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index] ^ key[index % key.length];
  }

  return output;
}

function serializeCookie(name: string, value: string, options?: { maxAge?: number }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure"];

  if (typeof options?.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join("; ");
}

export function createTwoFactorChallengeCookie(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000 });
  return serializeCookie(TWO_FACTOR_CHALLENGE_COOKIE, toBase64Url(payload), {
    maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  });
}

export function clearTwoFactorChallengeCookie(): string {
  return serializeCookie(TWO_FACTOR_CHALLENGE_COOKIE, "", { maxAge: 0 });
}

export function readTwoFactorChallenge(request: Request): { userId: string } | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TWO_FACTOR_CHALLENGE_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!token) {
    return null;
  }

  try {
    const decoded = fromBase64Url(decodeURIComponent(token));
    const data = JSON.parse(decoded) as { userId?: string; exp?: number };

    if (!data.userId || typeof data.exp !== "number" || data.exp <= Date.now()) {
      return null;
    }

    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function generateTwoFactorSecret(): string {
  return generateSecret();
}

export function generateOtpAuthUrl(email: string, secret: string): string {
  return generateURI({
    issuer: "Docsyra",
    label: email,
    secret,
    period: 30,
  });
}

export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  const result = await verify({
    secret,
    token,
    period: 30,
    epochTolerance: 0,
  });

  return result.valid;
}

export async function hashTwoFactorValue(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-8).toUpperCase();
    codes.push(value.padStart(8, "0"));
  }

  return codes;
}

export async function encryptTwoFactorSecret(secret: string, key: string): Promise<string> {
  if (!key) {
    throw new Error("TWO_FACTOR_SECRET_KEY is not configured");
  }

  const plainBytes = new TextEncoder().encode(secret);
  const keyBytes = new TextEncoder().encode(key);
  const cipherBytes = xorWithKey(plainBytes, keyBytes);

  return `enc:v1:${bytesToBase64Url(cipherBytes)}`;
}

export async function decryptTwoFactorSecret(secret: string, key: string): Promise<string> {
  if (!secret.startsWith("enc:v1:")) {
    // Backward compatibility for secrets created before encryption-at-rest.
    return secret;
  }

  if (!key) {
    throw new Error("TWO_FACTOR_SECRET_KEY is not configured");
  }

  const encodedPayload = secret.slice("enc:v1:".length);
  const cipherBytes = base64UrlToBytes(encodedPayload);
  const keyBytes = new TextEncoder().encode(key);
  const plainBytes = xorWithKey(cipherBytes, keyBytes);

  return new TextDecoder().decode(plainBytes);
}
