import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { resolveAIProvider } from "@/lib/ai";
import { buildPrompt } from "@/lib/ai/prompts";
import { AIError, type AIEnv, type AIRunRequestBody } from "@/lib/ai/types";
import { getUserAISettings } from "@/lib/db/queries";

export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const session = await lucia.validateSession(sessionId);
  if (!session.session || !session.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: AIRunRequestBody;
  try {
    body = (await request.json()) as AIRunRequestBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  let prompt;
  let provider;
  let config;
  try {
    prompt = buildPrompt(body);
    const userAISettings = await getUserAISettings(session.user.id, env).catch(() => null);
    ({ provider, config } = resolveAIProvider(env as AIEnv, userAISettings));
  } catch (error) {
    if (error instanceof AIError) {
      return Response.json({ success: false, error: error.message }, { status: error.status });
    }
    return Response.json({ success: false, error: "Failed to process AI request" }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of provider.stream(prompt, config, request.signal)) {
          controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch {
        // Best effort: a mid-stream failure cannot change the already-sent
        // headers, so just end the stream cleanly.
        try {
          controller.close();
        } catch {
          // Stream may already be closed/errored — ignore.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
