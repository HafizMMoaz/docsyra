/**
 * OpenAI provider for Docsyra's multi-provider AI integration.
 *
 * Uses the OpenAI Chat Completions API over raw `fetch` — no SDK, no extra
 * dependencies, edge-runtime safe. Streams plain-text deltas per the contract
 * in `../types.ts` / `../CONTRACT.md`.
 */

import { AIError } from "../types";
import type { AIProvider, AIStreamFn, AIChatMessage } from "../types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** OpenAI message role — adds `system` to our user/assistant roles. */
type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Parses an accumulated SSE buffer into complete events, leaving any trailing
 * partial line in the returned `rest`. Events are separated by newlines; only
 * `data:` lines carry payloads. Returns the `data:` payloads (sans prefix).
 */
function drainSSELines(buffer: string): { payloads: string[]; rest: string } {
  const payloads: string[] = [];
  let rest = buffer;

  let newlineIndex = rest.indexOf("\n");
  while (newlineIndex !== -1) {
    let line = rest.slice(0, newlineIndex);
    rest = rest.slice(newlineIndex + 1);

    // Tolerate CRLF line endings.
    if (line.endsWith("\r")) line = line.slice(0, -1);

    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      payloads.push(trimmed.slice("data:".length).trim());
    }
    // Non-data lines (comments, `event:`, blank separators) are ignored.

    newlineIndex = rest.indexOf("\n");
  }

  return { payloads, rest };
}

const stream: AIStreamFn = async function* (request, config, signal) {
  const messages: OpenAIMessage[] = [
    { role: "system" as const, content: request.system },
    ...request.messages.map(
      (m: AIChatMessage): OpenAIMessage => ({ role: m.role, content: m.content }),
    ),
  ];

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // Body unavailable — fall back to status alone.
    }
    throw new AIError(
      `OpenAI request failed: ${response.status}${detail ? ` ${detail}` : ""}`,
      response.status >= 500 ? 502 : response.status,
    );
  }

  if (!response.body) {
    throw new AIError("OpenAI request failed: empty response body", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const { payloads, rest } = drainSSELines(buffer);
      buffer = rest;

      for (const payload of payloads) {
        if (payload === "" || payload === "[DONE]") continue;

        let chunk: unknown;
        try {
          chunk = JSON.parse(payload);
        } catch {
          // Skip malformed chunks rather than aborting the stream.
          continue;
        }

        const delta = (chunk as {
          choices?: Array<{ delta?: { content?: unknown } }>;
        })?.choices?.[0]?.delta?.content;

        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    }
  } finally {
    // Release the stream lock even if the consumer stops early or aborts.
    try {
      await reader.cancel();
    } catch {
      // Reader may already be closed.
    }
  }
};

export const provider: AIProvider = {
  id: "openai",
  defaultModel: "gpt-4o",
  stream,
};
