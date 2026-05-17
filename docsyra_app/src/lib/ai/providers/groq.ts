/**
 * Groq provider for Docsyra's multi-provider AI integration.
 *
 * Groq exposes an OpenAI-compatible Chat Completions API, so this provider
 * speaks the same SSE wire format as the OpenAI provider. Uses raw `fetch`
 * only — no SDK, no extra deps, edge-runtime safe.
 */

import type {
  AICompletionRequest,
  AIProvider,
  AIProviderConfig,
} from "../types";
import { AIError } from "../types";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

/** A single chat turn in the OpenAI-compatible request shape. */
type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Minimal shape of a streamed SSE chunk we care about. */
type GroqStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
};

/** Map our provider-agnostic request into Groq's OpenAI-compatible messages. */
function toGroqMessages(request: AICompletionRequest): GroqMessage[] {
  return [
    { role: "system", content: request.system },
    ...request.messages,
  ];
}

/**
 * Stream the assistant response as incremental plain-text deltas.
 * Throws `AIError` before the first yield if the request fails.
 */
async function* stream(
  request: AICompletionRequest,
  config: AIProviderConfig,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      messages: toGroqMessages(request),
    }),
    signal,
  });

  if (!response.ok) {
    // Drain the body so the error message is useful; ignore read failures.
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    const message = detail
      ? `Groq request failed: ${response.status} ${detail}`
      : `Groq request failed: ${response.status}`;
    throw new AIError(message, response.status >= 500 ? 502 : response.status);
  }

  if (!response.body) {
    throw new AIError("Groq request failed: empty response body", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Buffers partial SSE lines that span across chunk boundaries.
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process every complete line; keep the trailing partial in `buffer`.
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        // Tolerate CRLF framing.
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line || !line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") return;
        if (!data) continue;

        let chunk: GroqStreamChunk;
        try {
          chunk = JSON.parse(data) as GroqStreamChunk;
        } catch {
          // Skip malformed/keep-alive payloads rather than aborting the stream.
          continue;
        }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    }

    // Flush any final buffered line that arrived without a trailing newline.
    const line = buffer.replace(/\r$/, "").trim();
    if (line.startsWith("data:")) {
      const data = line.slice("data:".length).trim();
      if (data && data !== "[DONE]") {
        try {
          const chunk = JSON.parse(data) as GroqStreamChunk;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield delta;
          }
        } catch {
          // Ignore a trailing malformed fragment.
        }
      }
    }
  } finally {
    // Release the underlying stream; safe to call after completion/abort.
    void reader.cancel().catch(() => {});
  }
}

export const provider: AIProvider = {
  id: "groq",
  defaultModel: "llama-3.3-70b-versatile",
  stream,
};
