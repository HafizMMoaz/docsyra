const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateOtpCode(): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** OTP_LENGTH;
  return String(random).padStart(OTP_LENGTH, "0");
}

export function getOtpExpiry(): number {
  return Date.now() + OTP_TTL_MS;
}

export async function hashOtpCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}
