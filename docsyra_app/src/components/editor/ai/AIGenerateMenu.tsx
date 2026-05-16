"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { LuArrowRight, LuPenLine, LuSparkles } from "react-icons/lu";

import { useAI } from "@/lib/ai/useAI";
import type { AIRunRequestBody } from "@/lib/ai/types";

import AIResultPopover from "@/components/editor/ai/AIResultPopover";

export type AIGenerateMenuProps = {
  /** Full document plain-text — forwarded to the API for `continue` / `generate`. */
  documentText: string;
  /** Insert the accepted AI output into the editor. */
  onInsert: (text: string) => void;
  /** Dismiss the menu without inserting anything. */
  onClose: () => void;
  /** Focus the prompt input on mount. */
  autoFocus?: boolean;
};

/** Which AI action the current run is for. */
type GenerateMode = "generate" | "continue";

const MODE_TITLE: Record<GenerateMode, string> = {
  generate: "Generate",
  continue: "Continue writing",
};

/**
 * Notion-style "ask AI to write / continue writing" menu for the editor.
 *
 * Two modes: generate from a freeform prompt, or continue the document from
 * the cursor. Streams output through `useAI` and hands it to `AIResultPopover`
 * for Accept / Retry / Discard. Positioning is owned by the caller.
 */
export default function AIGenerateMenu({
  documentText,
  onInsert,
  onClose,
  autoFocus,
}: AIGenerateMenuProps) {
  const { run, cancel, isStreaming } = useAI();

  const [prompt, setPrompt] = useState("");
  /** Null while showing the prompt view; set once a run has started. */
  const [mode, setMode] = useState<GenerateMode | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const startRun = useCallback(
    (nextMode: GenerateMode, instruction?: string) => {
      const trimmed = instruction?.trim() ?? "";
      if (nextMode === "generate" && !trimmed) {
        return;
      }

      setMode(nextMode);
      setResult("");
      setError(null);

      const body: AIRunRequestBody =
        nextMode === "generate"
          ? { action: "generate", instruction: trimmed, documentText }
          : { action: "continue", documentText };

      void run(body, {
        onDelta: (text) => setResult((prev) => prev + text),
        onDone: () => {},
        onError: (message) => setError(message),
      });
    },
    [documentText, run],
  );

  const handleGenerate = useCallback(() => {
    startRun("generate", prompt);
  }, [prompt, startRun]);

  const handleContinue = useCallback(() => {
    startRun("continue");
  }, [startRun]);

  const handleRetry = useCallback(() => {
    if (mode === "generate") {
      startRun("generate", prompt);
    } else if (mode === "continue") {
      startRun("continue");
    }
  }, [mode, prompt, startRun]);

  const handleDiscard = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  const handleAccept = useCallback(() => {
    onInsert(result);
    onClose();
  }, [onInsert, onClose, result]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleGenerate();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [handleGenerate, onClose],
  );

  // Result view — a run has been started.
  if (mode !== null) {
    return (
      <AIResultPopover
        open
        title={MODE_TITLE[mode]}
        result={result}
        isStreaming={isStreaming}
        error={error}
        onAccept={handleAccept}
        onRetry={handleRetry}
        onDiscard={handleDiscard}
      />
    );
  }

  // Prompt view — pick a mode.
  const canGenerate = prompt.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        role="dialog"
        aria-label="Ask AI to write"
        className="flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-rule bg-paper-card shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-rule px-3.5 py-2.5">
          <LuSparkles aria-hidden="true" className="h-3.5 w-3.5 text-clay" />
          <p className="eyebrow text-clay">Ask AI</p>
        </div>

        {/* Prompt */}
        <div className="flex flex-col gap-2.5 px-3.5 py-3">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask AI to write…"
            className="w-full resize-none rounded-sm border border-rule-strong bg-paper px-2.5 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-faint">
              <kbd className="font-sans font-medium">Enter</kbd> to generate
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-1.5 rounded-sm bg-clay px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-clay"
            >
              <LuSparkles aria-hidden="true" className="h-3 w-3" />
              Generate
            </button>
          </div>
        </div>

        {/* Continue writing */}
        <div className="border-t border-rule bg-paper-raised/60 px-3.5 py-2.5">
          <button
            type="button"
            onClick={handleContinue}
            className="group flex w-full items-center justify-between gap-3 rounded-sm border border-transparent px-2 py-1.5 text-left transition hover:border-rule-strong hover:bg-clay-wash/60"
          >
            <span className="flex items-center gap-2">
              <LuPenLine
                aria-hidden="true"
                className="h-3.5 w-3.5 text-pine"
              />
              <span className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  Continue writing
                </span>
                <span className="text-[11px] text-ink-soft">
                  Pick up from where the document ends
                </span>
              </span>
            </span>
            <LuArrowRight
              aria-hidden="true"
              className="h-3.5 w-3.5 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
            />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
