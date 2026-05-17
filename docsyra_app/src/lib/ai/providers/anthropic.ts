/**
 * Anthropic provider for Docsyra's multi-provider AI integration.
 *
 * Talks to the Anthropic Messages API over raw `fetch` (edge-runtime safe —
 * no SDK, no extra deps). Streams SSE and yields plain-text deltas only.
 */

import { AIError } from "../types";
import type { AIProvider, AIStreamFn } from "../types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

/** A single SSE `data:` payload from the Anthropic stream. */
type AnthropicSSEEvent = {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
  };
};

const stream: AIStreamFn = async function* (request, config, signal) {
  if (signal?.aborted) return;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      system: [
        {
          type: "text",
          text: request.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: request.messages,
    }),
    signal,
  });

  if (!response.ok) {
    // Drain the body for diagnostics; status drives the thrown error.
    const detail = await response.text().catch(() => "");
    const message = detail
      ? `Anthropic request failed: ${response.status} ${detail}`
      : `Anthropic request failed: ${response.status}`;
    throw new AIError(message, response.status >= 500 ? 502 : response.status);
  }

  if (!response.body) {
    throw new AIError("Anthropic request failed: empty response body", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Buffer holds the unparsed tail — SSE events can split across read chunks.
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; lines by `\n`.
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const line = rawLine.replace(/\r$/, "").trim();
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (!data) continue;

        let event: AnthropicSSEEvent;
        try {
          event = JSON.parse(data) as AnthropicSSEEvent;
        } catch {
          // Ignore malformed payloads rather than aborting the stream.
          continue;
        }

        if (event.type === "message_stop") return;

        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          if (event.delta.text) yield event.delta.text;
        }
      }
    }
  } finally {
    // Release the underlying stream — important on early return / abort.
    await reader.cancel().catch(() => {});
  }
};

export const provider: AIProvider = {
  id: "anthropic",
  defaultModel: "claude-opus-4-7",
  stream,
};
