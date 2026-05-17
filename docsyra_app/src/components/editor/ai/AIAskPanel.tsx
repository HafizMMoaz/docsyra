"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiCornerDownLeft,
  FiFileText,
  FiMessageSquare,
  FiPlusCircle,
  FiRefreshCw,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import { useAI } from "@/lib/ai/useAI";
import type { AIRunRequestBody } from "@/lib/ai/types";

export type AIAskPanelProps = {
  /** Full document plain-text — fed to summarize / ask. */
  documentText: string;
  /** Optional: insert the finished result into the document. */
  onInsert?: (text: string) => void;
  /** Dismiss the panel. */
  onClose: () => void;
};

/** What produced the current result — drives the header label and Retry. */
type ActiveMode =
  | { kind: "summarize" }
  | { kind: "ask"; question: string };

/**
 * "Summarize & Ask" side panel for the Docsyra editor.
 *
 * Two capabilities over the whole document:
 *  - Summarize — one click, streams a summary.
 *  - Ask — type a question, streams an answer; the question stays pinned
 *    above its answer for a light conversation feel.
 *
 * Presentational + streaming only. The integrating agent mounts this panel,
 * supplies `documentText`, and (optionally) wires `onInsert` into the editor.
 */
export default function AIAskPanel({ documentText, onInsert, onClose }: AIAskPanelProps) {
  const { run, cancel, isStreaming } = useAI();

  const [question, setQuestion] = useState("");
  const [active, setActive] = useState<ActiveMode | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Streaming deltas accumulate into a ref, then flush to state — keeps the
  // visible string consistent even across rapid delta callbacks.
  const resultRef = useRef("");

  const docEmpty = documentText.trim().length === 0;
  const hasResult = result.trim().length > 0;
  const canRun = !isStreaming && !docEmpty;

  const start = useCallback(
    (mode: ActiveMode) => {
      const body: AIRunRequestBody =
        mode.kind === "summarize"
          ? { action: "summarize", documentText }
          : { action: "ask", instruction: mode.question, documentText };

      resultRef.current = "";
      setResult("");
      setError(null);
      setActive(mode);

      void run(body, {
        onDelta: (text) => {
          resultRef.current += text;
          setResult(resultRef.current);
        },
        onDone: () => {
          setResult(resultRef.current);
        },
        onError: (message) => {
          setError(message);
        },
      });
    },
    [documentText, run],
  );

  const handleSummarize = useCallback(() => {
    if (!canRun) return;
    start({ kind: "summarize" });
  }, [canRun, start]);

  const handleAsk = useCallback(() => {
    const trimmed = question.trim();
    if (!canRun || trimmed.length === 0) return;
    start({ kind: "ask", question: trimmed });
  }, [canRun, question, start]);

  const handleRetry = useCallback(() => {
    if (!active || docEmpty) return;
    start(active);
  }, [active, docEmpty, start]);

  const handleClear = useCallback(() => {
    cancel();
    resultRef.current = "";
    setResult("");
    setError(null);
    setActive(null);
  }, [cancel]);

  const handleInsert = useCallback(() => {
    if (!onInsert || !hasResult) return;
    onInsert(result.trim());
  }, [hasResult, onInsert, result]);

  const handleQuestionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleAsk();
      }
    },
    [handleAsk],
  );

  const headerLabel =
    active?.kind === "summarize"
      ? "Document summary"
      : active?.kind === "ask"
        ? "Answer"
        : "Summarize & Ask";

  const ghostButton =
    "inline-flex items-center gap-1.5 rounded-sm border border-rule-strong px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-rule-strong disabled:hover:text-ink-soft";

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role="dialog"
      aria-label="Summarize and ask about the document"
      className="flex h-full w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-rule bg-paper-card shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="eyebrow text-clay">Ask the document</p>
          <p className="text-sm font-semibold text-ink">{headerLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-sm p-1.5 text-ink-faint transition hover:bg-paper-raised hover:text-ink"
        >
          <FiX className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 border-b border-rule px-4 py-3.5">
        <button
          type="button"
          onClick={handleSummarize}
          disabled={!canRun}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-clay px-3.5 py-2 text-sm font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-clay"
        >
          <FiFileText className="h-4 w-4" aria-hidden="true" />
          Summarize document
        </button>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="ai-ask-question"
            className="eyebrow text-ink-faint"
          >
            Ask a question
          </label>
          <div className="rounded-sm border border-rule-strong bg-paper-raised/60 transition focus-within:border-ink">
            <textarea
              id="ai-ask-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              rows={2}
              placeholder="What is this document about?"
              className="w-full resize-none bg-transparent px-2.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 border-t border-rule px-2.5 py-1.5">
              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                <FiCornerDownLeft className="h-3 w-3" aria-hidden="true" />
                Enter to ask
              </span>
              <button
                type="button"
                onClick={handleAsk}
                disabled={!canRun || question.trim().length === 0}
                className="inline-flex items-center gap-1.5 rounded-sm border border-clay bg-clay-wash px-2.5 py-1 text-xs font-semibold text-clay transition hover:bg-clay hover:text-paper disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-clay-wash disabled:hover:text-clay"
              >
                <FiMessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Ask
              </button>
            </div>
          </div>
        </div>

        {docEmpty ? (
          <p className="text-xs italic text-ink-faint">
            The document is empty — add some content first.
          </p>
        ) : null}
      </div>

      {/* Conversation / result area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3.5">
        {active?.kind === "ask" ? (
          <div className="mb-2.5 self-end rounded-sm rounded-br-none border border-rule bg-paper-raised px-3 py-2 text-sm text-ink-soft">
            <span className="eyebrow mb-0.5 block text-ink-faint">You asked</span>
            <span className="whitespace-pre-wrap break-words">{active.question}</span>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-sm border-l-2 border-signal-danger bg-clay-wash/60 px-2.5 py-2 text-sm text-signal-danger"
            >
              {error}
            </motion.p>
          ) : hasResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={
                active?.kind === "ask"
                  ? "rounded-sm rounded-tl-none border border-rule bg-paper px-3 py-2.5"
                  : "rounded-sm border border-rule bg-paper px-3 py-2.5"
              }
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {result}
                {isStreaming ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-clay align-middle"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  />
                ) : null}
              </p>
            </motion.div>
          ) : isStreaming ? (
            <motion.p
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-sm italic text-ink-faint"
            >
              <motion.span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-clay"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
              Reading the document…
            </motion.p>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm italic text-ink-faint"
            >
              Summarize the document or ask a question to get started.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 border-t border-rule bg-paper-raised/60 px-4 py-3">
        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint">
            <motion.span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-clay"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
            Generating…
          </span>
        ) : (
          <span className="text-[11px] text-ink-faint">
            {hasResult ? "Result ready" : "Idle"}
          </span>
        )}

        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button type="button" onClick={cancel} className={ghostButton}>
              <FiX className="h-3.5 w-3.5" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClear}
                disabled={!hasResult && error === null && active === null}
                className={ghostButton}
              >
                <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
              <button
                type="button"
                onClick={handleRetry}
                disabled={active === null || docEmpty}
                className={ghostButton}
              >
                <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
              {onInsert ? (
                <button
                  type="button"
                  onClick={handleInsert}
                  disabled={!hasResult || error !== null}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-clay px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-clay"
                >
                  <FiPlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Insert
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
