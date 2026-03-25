const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "SHA-256";

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: DIGEST,
      salt: salt as BufferSource,
      iterations: ITERATIONS,
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt);

  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterationCount = Number(parts[1]);
  if (!Number.isFinite(iterationCount) || iterationCount <= 0) {
    return false;
  }

  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: DIGEST,
      salt: salt as BufferSource,
      iterations: iterationCount,
    },
    keyMaterial,
    expected.length * 8,
  );

  const actual = new Uint8Array(bits);

  if (actual.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= actual[i] ^ expected[i];
  }

  return mismatch === 0;
}
