import { getRequestContext } from "@cloudflare/next-on-pages";
import {
  appendOAuthCodeVerifierCookie,
  appendOAuthStateCookie,
  createGoogleOAuth,
  createOAuthCodeVerifier,
  createOAuthState,
} from "@/lib/auth/oauth";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const { env } = getRequestContext();
  const origin = new URL(request.url).origin;

  const google = createGoogleOAuth(env, origin);
  const state = createOAuthState();
  const codeVerifier = createOAuthCodeVerifier();

  const authorizationUrl = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

  const headers = new Headers({
    Location: authorizationUrl.toString(),
  });

  appendOAuthStateCookie(headers, "google", state);
  appendOAuthCodeVerifierCookie(headers, "google", codeVerifier);

  return new Response(null, { status: 302, headers });
}
