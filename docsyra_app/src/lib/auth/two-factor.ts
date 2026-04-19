import { getRequestContext } from "@cloudflare/next-on-pages";
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
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-8).toUpperCase();
    codes.push(value.padStart(8, "0"));
  }

  return codes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getEncryptionKeyMaterial(): string {
  try {
    const key = getRequestContext().env.TWO_FACTOR_SECRET_KEY ?? process.env.TWO_FACTOR_SECRET_KEY;
    if (!key) {
      throw new Error("Missing TWO_FACTOR_SECRET_KEY");
    }

    return key;
  } catch {
    const key = process.env.TWO_FACTOR_SECRET_KEY;
    if (!key) {
      throw new Error("Missing TWO_FACTOR_SECRET_KEY");
    }

    return key;
  }
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyMaterial = getEncryptionKeyMaterial();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial));

  return await globalThis.crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(secret: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(secret);

  const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      tagLength: 128,
    },
    key,
    toArrayBuffer(plain),
  );

  // Format: iv:ciphertextWithTag
  return [bytesToBase64(iv), bytesToBase64(new Uint8Array(encryptedBuffer))].join(":");
}

export async function decryptSecret(encrypted: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const parts = encrypted.split(":");

    if (parts.length !== 2 && parts.length !== 3) {
      throw new Error("Invalid encrypted format");
    }

    const iv = base64ToBytes(parts[0]);
    const cipherBytes = parts.length === 3
      ? concatBytes(base64ToBytes(parts[2]), base64ToBytes(parts[1])) // legacy: iv:tag:data
      : base64ToBytes(parts[1]); // new: iv:cipher+tag

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
      },
      key,
      toArrayBuffer(cipherBytes),
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    // Migration fallback for previously stored plaintext values.
    return encrypted;
  }
}