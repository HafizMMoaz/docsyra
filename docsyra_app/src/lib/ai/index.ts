/**
 * Provider registry for Docsyra's multi-provider AI integration.
 *
 * Resolves the active provider from `env` and produces its runtime config.
 * Builds against `types.ts` only.
 */
import { provider as anthropicProvider } from "./providers/anthropic";
import { provider as openaiProvider } from "./providers/openai";
import { provider as groqProvider } from "./providers/groq";
import { provider as geminiProvider } from "./providers/gemini";
import {
  AIError,
  type AIEnv,
  type AIProvider,
  type AIProviderConfig,
  type AIProviderId,
} from "./types";

const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  groq: groqProvider,
  gemini: geminiProvider,
};

/** Maps each provider id to its `*_API_KEY` / `*_MODEL` env var keys. */
const ENV_KEYS: Record<AIProviderId, { apiKey: keyof AIEnv; model: keyof AIEnv }> = {
  anthropic: { apiKey: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
  openai: { apiKey: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  groq: { apiKey: "GROQ_API_KEY", model: "GROQ_MODEL" },
  gemini: { apiKey: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
};

function isProviderId(value: string): value is AIProviderId {
  return value === "anthropic" || value === "openai" || value === "groq" || value === "gemini";
}

/**
 * Resolves the configured AI provider and its runtime config from `env`.
 * Throws `AIError(…, 500)` for an unknown provider or a missing API key.
 */
export function resolveAIProvider(env: AIEnv): { provider: AIProvider; config: AIProviderConfig } {
  const providerId = (env.AI_PROVIDER ?? "anthropic").trim();

  if (!isProviderId(providerId)) {
    throw new AIError("Unknown AI provider", 500);
  }

  const provider = PROVIDERS[providerId];
  const { apiKey: apiKeyVar, model: modelVar } = ENV_KEYS[providerId];

  const apiKey = (env[apiKeyVar] ?? "").trim();
  if (!apiKey) {
    throw new AIError("AI provider is not configured", 500);
  }

  const model = (env[modelVar] ?? "").trim() || provider.defaultModel;

  return { provider, config: { apiKey, model } };
}
