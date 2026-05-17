"use client";

import { AnimatePresence, motion } from "framer-motion";

export type AIResultPopoverProps = {
  /** Whether the popover is visible. */
  open: boolean;
  /** Short action label, shown as an eyebrow (e.g. "Improve writing"). */
  title: string;
  /** The streaming / final AI output text. */
  result: string;
  /** True while deltas are still arriving. */
  isStreaming: boolean;
  /** Error message, or null when there is no error. */
  error: string | null;
  /** Accept the result — caller wires this into the editor. */
  onAccept: () => void;
  /** Re-run the same action. */
  onRetry: () => void;
  /** Dismiss without applying. */
  onDiscard: () => void;
};

/**
 * Presentational popover that displays streaming AI output with
 * Accept / Retry / Discard actions. Positioning is owned by the caller —
 * this component only renders the floating card and its three callbacks.
 */
export function AIResultPopover({
  open,
  title,
  result,
  isStreaming,
  error,
  onAccept,
  onRetry,
  onDiscard,
}: AIResultPopoverProps) {
  const hasResult = result.trim().length > 0;
  const acceptDisabled = isStreaming || error !== null || !hasResult;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          role="dialog"
          aria-label={title}
          className="flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-rule bg-paper-card shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-rule px-3.5 py-2.5">
            <p className="eyebrow text-clay">{title}</p>
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
            ) : null}
          </div>

          {/* Body */}
          <div className="max-h-72 overflow-y-auto px-3.5 py-3">
            {error ? (
              <p className="rounded-sm border-l-2 border-signal-danger bg-clay-wash/60 px-2.5 py-2 text-sm text-signal-danger">
                {error}
              </p>
            ) : hasResult ? (
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
            ) : (
              <p className="text-sm italic text-ink-faint">
                {isStreaming ? "Thinking…" : "No output yet."}
              </p>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-rule bg-paper-raised/60 px-3.5 py-2.5">
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-sm border border-rule-strong px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-sm border border-rule-strong px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={acceptDisabled}
              className="rounded-sm bg-clay px-3.5 py-1.5 text-xs font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-clay"
            >
              Accept
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default AIResultPopover;
