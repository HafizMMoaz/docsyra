import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import { getUserAISettings, upsertUserAISettings } from "@/lib/db/queries";
import { AI_PROVIDER_IDS, type AIProviderId, type AIUserSettings } from "@/lib/ai/types";

export const runtime = "edge";

type ProviderState = {
  keyConfigured: boolean;
  model: string | null;
};

type AISettingsBody = {
  provider?: unknown;
  anthropicApiKey?: unknown;
  anthropicModel?: unknown;
  openaiApiKey?: unknown;
  openaiModel?: unknown;
  groqApiKey?: unknown;
  groqModel?: unknown;
  geminiApiKey?: unknown;
  geminiModel?: unknown;
};

function isProviderId(value: string): value is AIProviderId {
  return AI_PROVIDER_IDS.includes(value as AIProviderId);
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function requireUser(request: Request, env: any): Promise<{ id: string } | Response> {
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return { id: result.user.id };
}

function buildResponse(settings: AIUserSettings | null): { success: true; provider: AIProviderId; providers: Record<AIProviderId, ProviderState> } {
  const providers: Record<AIProviderId, ProviderState> = {
    anthropic: { keyConfigured: false, model: null },
    openai: { keyConfigured: false, model: null },
    groq: { keyConfigured: false, model: null },
    gemini: { keyConfigured: false, model: null },
  };

  if (settings) {
    for (const providerId of AI_PROVIDER_IDS) {
      providers[providerId] = {
        keyConfigured: Boolean(settings.providers[providerId].apiKey),
        model: settings.providers[providerId].model,
      };
    }

    return { success: true, provider: settings.provider, providers };
  }

  return { success: true, provider: "anthropic", providers };
}

function mergeSettings(existing: AIUserSettings | null, body: AISettingsBody): AIUserSettings {
  const provider = typeof body.provider === "string" && isProviderId(body.provider) ? body.provider : existing?.provider ?? "anthropic";

  const current: AIUserSettings = existing ?? {
    provider,
    providers: {
      anthropic: { apiKey: null, model: null },
      openai: { apiKey: null, model: null },
      groq: { apiKey: null, model: null },
      gemini: { apiKey: null, model: null },
    },
  };

  current.provider = provider;

  const updates: Record<AIProviderId, { apiKey?: string; model?: string | null }> = {
    anthropic: { apiKey: readText(body.anthropicApiKey), model: readText(body.anthropicModel) },
    openai: { apiKey: readText(body.openaiApiKey), model: readText(body.openaiModel) },
    groq: { apiKey: readText(body.groqApiKey), model: readText(body.groqModel) },
    gemini: { apiKey: readText(body.geminiApiKey), model: readText(body.geminiModel) },
  };

  for (const providerId of AI_PROVIDER_IDS) {
    const update = updates[providerId];
    const existingProvider = current.providers[providerId];

    current.providers[providerId] = {
      apiKey: update.apiKey ?? existingProvider.apiKey,
      model: update.model === undefined ? existingProvider.model : update.model,
    };
  }

  return current;
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const auth = await requireUser(request, env);

  if (auth instanceof Response) {
    return auth;
  }

  const settings = await getUserAISettings(auth.id, env).catch(() => null);
  return Response.json(buildResponse(settings), { status: 200 });
}

export async function PUT(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  let body: AISettingsBody;
  try {
    body = (await request.json()) as AISettingsBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const existing = await getUserAISettings(auth.id, env).catch(() => null);
  const merged = mergeSettings(existing, body);

  try {
    await upsertUserAISettings(auth.id, merged, env);
    return Response.json(buildResponse(merged), { status: 200 });
  } catch {
    return Response.json({ success: false, error: "Failed to save AI settings" }, { status: 500 });
  }
}