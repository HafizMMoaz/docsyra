/**
 * Shared contract for Docsyra's multi-provider AI integration.
 *
 * Every provider module and the API route build against THESE types only.
 * Do not change this file without updating CONTRACT.md and every consumer.
 */

export type AIProviderId = "anthropic" | "openai" | "groq" | "gemini";

/** The set of AI actions the editor can invoke. */
export type AIActionId =
  // selection actions — operate on highlighted text
  | "improve"
  | "fix-grammar"
  | "shorten"
  | "lengthen"
  | "change-tone"
  | "translate"
  // generation
  | "generate" // write something new from a prompt
  | "continue" // continue the document from the cursor
  // document-level
  | "summarize"
  | "ask";

/** A single chat turn. The system prompt is passed separately. */
export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Provider-agnostic completion request. */
export type AICompletionRequest = {
  /** System prompt — stable per action, good caching prefix. */
  system: string;
  /** Conversation turns. Must start with a `user` turn. */
  messages: AIChatMessage[];
  /** Output cap. Defaults to 4096 if omitted. */
  maxTokens?: number;
};

/** Resolved per-provider runtime config (key + model). */
export type AIProviderConfig = {
  apiKey: string;
  model: string;
};

/**
 * A provider streams the assistant response as incremental plain-text deltas.
 * Implementations MUST:
 *  - yield only text fragments (no SSE framing, no JSON)
 *  - throw an Error before the first yield if the request fails
 *  - respect `signal` and stop yielding when aborted
 */
export type AIStreamFn = (
  request: AICompletionRequest,
  config: AIProviderConfig,
  signal?: AbortSignal,
) => AsyncGenerator<string, void, unknown>;

export interface AIProvider {
  id: AIProviderId;
  /** Used when no provider-specific *_MODEL env var is set. */
  defaultModel: string;
  stream: AIStreamFn;
}

/**
 * Request body the `/api/ai` route accepts from the editor client.
 * The route maps `action` + these fields into a system prompt + messages
 * via `buildPrompt()` in `prompts.ts`.
 */
export type AIRunRequestBody = {
  action: AIActionId;
  /** Selected text (selection actions) or topic (generate). */
  input?: string;
  /**
   * Freeform user instruction:
   *  - change-tone: the target tone ("formal", "friendly", ...)
   *  - translate: the target language
   *  - generate: what to write
   *  - ask: the question
   */
  instruction?: string;
  /** Full document plain-text — used by summarize / ask / continue. */
  documentText?: string;
};

/** Env shape the AI layer reads (all optional — resolver validates). */
export type AIEnv = {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

/** Thrown by the resolver / providers for clean 4xx-5xx mapping in the route. */
export class AIError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AIError";
    this.status = status;
  }
}
