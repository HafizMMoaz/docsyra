"use client";

import { useCallback, useRef, useState } from "react";

import { getCsrfToken } from "@/lib/security/csrf-client";

import type { AIRunRequestBody } from "./types";

/** Callbacks the caller wires into the editor / result popover. */
export type AIRunHandlers = {
  /** Called for every decoded text fragment as it streams in. */
  onDelta: (text: string) => void;
  /** Called once the stream completes successfully. */
  onDone: () => void;
  /** Called with a human-readable message on failure (never for a user cancel). */
  onError: (message: string) => void;
};

/** CSRF headers — mirrors `csrfHeaders()` in the editor page. */
function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

export type UseAIResult = {
  /** POST `body` to `/api/ai` and stream the plain-text response back via handlers. */
  run: (body: AIRunRequestBody, handlers: AIRunHandlers) => Promise<void>;
  /** Abort the in-flight request, if any. */
  cancel: () => void;
  /** Reactive flag — true while a request is streaming. */
  isStreaming: boolean;
};

/**
 * React hook for the Docsyra AI integration.
 *
 * Talks to the `/api/ai` route which streams raw UTF-8 text (not SSE, not JSON).
 * The hook reads the `ReadableStream`, decodes chunks, and forwards each delta.
 */
export function useAI(): UseAIResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const run = useCallback(
    async (body: AIRunRequestBody, handlers: AIRunHandlers): Promise<void> => {
      // Drop any previous in-flight request before starting a new one.
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...csrfHeaders(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = `Request failed (${response.status})`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data?.error) {
              message = data.error;
            }
          } catch {
            // Non-JSON error body — keep the status-based fallback message.
          }
          handlers.onError(message);
          return;
        }

        if (!response.body) {
          handlers.onError("No response stream received.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              handlers.onDelta(chunk);
            }
          }
        }

        // Flush any buffered multi-byte character.
        const tail = decoder.decode();
        if (tail) {
          handlers.onDelta(tail);
        }

        handlers.onDone();
      } catch (error) {
        // A user-initiated cancel is not an error — swallow it silently.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        handlers.onError(
          error instanceof Error ? error.message : "Something went wrong while contacting AI.",
        );
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [],
  );

  return { run, cancel, isStreaming };
}
