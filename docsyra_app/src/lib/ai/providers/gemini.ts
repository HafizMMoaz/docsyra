/**
 * Google Gemini provider for Docsyra's multi-provider AI integration.
 *
 * Talks to the Gemini `streamGenerateContent` API over raw `fetch`
 * (edge-runtime safe — no SDK, no extra deps). Streams SSE and yields
 * plain-text deltas only.
 */

import { AIError } from "../types";
import type { AIProvider, AIStreamFn } from "../types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** A single SSE `data:` payload from the Gemini stream. */
type GeminiSSEEvent = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const stream: AIStreamFn = async function* (request, config, signal) {
  if (signal?.aborted) return;

  const endpoint =
    `${BASE_URL}/${encodeURIComponent(config.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.system }],
      },
      contents: request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    }),
    signal,
  });

  if (!response.ok) {
    // Drain the body for diagnostics; status drives the thrown error.
    const detail = await response.text().catch(() => "");
    const message = detail
      ? `Gemini request failed: ${response.status} ${detail}`
      : `Gemini request failed: ${response.status}`;
    throw new AIError(message, response.status >= 500 ? 502 : response.status);
  }

  if (!response.body) {
    throw new AIError("Gemini request failed: empty response body", 502);
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

      // SSE lines are separated by `\n`; an event may span multiple reads.
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const line = rawLine.replace(/\r$/, "").trim();
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (!data) continue;

        let event: GeminiSSEEvent;
        try {
          event = JSON.parse(data) as GeminiSSEEvent;
        } catch {
          // Ignore malformed payloads rather than aborting the stream.
          continue;
        }

        const parts = event.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (typeof part.text === "string" && part.text) {
            yield part.text;
          }
        }
      }
    }
  } finally {
    // Release the underlying stream — important on early return / abort.
    await reader.cancel().catch(() => {});
  }
};

export const provider: AIProvider = {
  id: "gemini",
  defaultModel: "gemini-2.0-flash",
  stream,
};
