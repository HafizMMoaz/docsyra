import { cookies } from "next/headers";

const CSRF_COOKIE_NAME = "csrf_token";

/**
 * Generate secure CSRF token
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Set CSRF cookie
 */
export async function setCsrfCookie() {
  const token = generateCsrfToken();

  (await cookies()).set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: true,
    sameSite: "strict",
    path: "/",
  });

  return token;
}

/**
 * Verify CSRF token
 */
export async function verifyCsrf(request: Request) {
  const cookieStore = await cookies();

  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get("x-csrf-token");

  if (!cookieToken || !headerToken) {
    throw new Error("CSRF token missing");
  }

  if (cookieToken !== headerToken) {
    throw new Error("CSRF token mismatch");
  }
}

export async function rejectCsrf(request: Request): Promise<Response | null> {
  try {
    await verifyCsrf(request);
    return null;
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "CSRF validation failed",
      },
      { status: 403 },
    );
  }
}
