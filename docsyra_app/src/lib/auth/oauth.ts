import { generateCodeVerifier, generateState, GitHub, Google } from "arctic";

export type OAuthProvider = "google" | "github";

const OAUTH_STATE_COOKIE_PREFIX = "oauth_state_";
const OAUTH_VERIFIER_COOKIE_PREFIX = "oauth_verifier_";

type OAuthEnv = {
  GOOGLE_CLIENT_ID?: unknown;
  GOOGLE_CLIENT_SECRET?: unknown;
  GITHUB_CLIENT_ID?: unknown;
  GITHUB_CLIENT_SECRET?: unknown;
};

function requireEnv(env: unknown, key: keyof OAuthEnv): string {
  const source = (env ?? {}) as OAuthEnv;
  const value = source[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing OAuth env var: ${key}`);
  }
  return value;
}

function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function createGoogleOAuth(env: unknown, origin: string): Google {
  return new Google(
    requireEnv(env, "GOOGLE_CLIENT_ID"),
    requireEnv(env, "GOOGLE_CLIENT_SECRET"),
    `${origin}/api/auth/callback/google`,
  );
}

export function createGitHubOAuth(env: unknown, origin: string): GitHub {
  return new GitHub(
    requireEnv(env, "GITHUB_CLIENT_ID"),
    requireEnv(env, "GITHUB_CLIENT_SECRET"),
    `${origin}/api/auth/callback/github`,
  );
}

export function createOAuthState(): string {
  return generateState();
}

export function createOAuthCodeVerifier(): string {
  return generateCodeVerifier();
}

export function appendOAuthStateCookie(headers: Headers, provider: OAuthProvider, state: string): void {
  headers.append("Set-Cookie", buildCookie(`${OAUTH_STATE_COOKIE_PREFIX}${provider}`, state, 600));
}

export function appendOAuthCodeVerifierCookie(headers: Headers, provider: OAuthProvider, verifier: string): void {
  headers.append("Set-Cookie", buildCookie(`${OAUTH_VERIFIER_COOKIE_PREFIX}${provider}`, verifier, 600));
}

export function clearOAuthCookies(headers: Headers, provider: OAuthProvider): void {
  headers.append("Set-Cookie", clearCookie(`${OAUTH_STATE_COOKIE_PREFIX}${provider}`));
  headers.append("Set-Cookie", clearCookie(`${OAUTH_VERIFIER_COOKIE_PREFIX}${provider}`));
}

export function readOAuthState(request: Request, provider: OAuthProvider): string | null {
  return readCookie(request, `${OAUTH_STATE_COOKIE_PREFIX}${provider}`);
}

export function readOAuthCodeVerifier(request: Request, provider: OAuthProvider): string | null {
  return readCookie(request, `${OAUTH_VERIFIER_COOKIE_PREFIX}${provider}`);
}
