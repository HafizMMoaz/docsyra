import { getRequestContext } from "@cloudflare/next-on-pages";
import { appendOAuthStateCookie, createGitHubOAuth, createOAuthState } from "@/lib/auth/oauth";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const { env } = getRequestContext();
  const origin = new URL(request.url).origin;

  const github = createGitHubOAuth(env, origin);
  const state = createOAuthState();

  const authorizationUrl = github.createAuthorizationURL(state, ["repo", "read:user", "user:email"]);

  const headers = new Headers({
    Location: authorizationUrl.toString(),
  });

  appendOAuthStateCookie(headers, "github", state);

  return new Response(null, { status: 302, headers });
}
