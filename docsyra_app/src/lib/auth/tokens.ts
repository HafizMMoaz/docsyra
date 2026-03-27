const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (const value of bytes) {
      binary += String.fromCharCode(value);
    }
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createSecureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return toBase64Url(bytes);
}

export function createExpiry(minutes: number): number {
  return Date.now() + minutes * 60 * 1000;
}
