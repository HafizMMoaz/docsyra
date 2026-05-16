"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiArrowLeft,
  FiCheck,
  FiChevronRight,
  FiCornerDownLeft,
  FiGlobe,
  FiMaximize2,
  FiMinimize2,
  FiSliders,
  FiX,
} from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import type { IconType } from "react-icons";

import { useAI } from "@/lib/ai/useAI";
import type { AIActionId } from "@/lib/ai/types";

import AIResultPopover from "@/components/editor/ai/AIResultPopover";

export type AISelectionMenuProps = {
  /** The highlighted text the action operates on. */
  selectedText: string;
  /** Apply the accepted AI output back into the editor. */
  onApply: (text: string) => void;
  /** Dismiss the menu without applying anything. */
  onClose: () => void;
};

/** A selection action — the ones the editor can run on highlighted text. */
type SelectionActionId = Extract<
  AIActionId,
  "improve" | "fix-grammar" | "shorten" | "lengthen" | "change-tone" | "translate"
>;

type SelectionAction = {
  id: SelectionActionId;
  label: string;
  icon: IconType;
  /** Actions that need a freeform instruction before they can run. */
  instruction?: {
    /** Eyebrow shown above the inline input. */
    prompt: string;
    /** Placeholder for the inline input. */
    placeholder: string;
  };
};

const ACTIONS: SelectionAction[] = [
  { id: "improve", label: "Improve writing", icon: HiOutlineSparkles },
  { id: "fix-grammar", label: "Fix grammar", icon: FiCheck },
  { id: "shorten", label: "Make shorter", icon: FiMinimize2 },
  { id: "lengthen", label: "Make longer", icon: FiMaximize2 },
  {
    id: "change-tone",
    label: "Change tone",
    icon: FiSliders,
    instruction: { prompt: "Target tone", placeholder: "e.g. Professional" },
  },
  {
    id: "translate",
    label: "Translate",
    icon: FiGlobe,
    instruction: { prompt: "Target language", placeholder: "e.g. Spanish" },
  },
];

type View = "list" | "instruction" | "result";

/**
 * Notion-style selection actions menu for the Docsyra editor.
 *
 * Renders a compact list of AI actions over a highlighted range. Actions that
 * need an instruction (tone / language) open a small inline prompt; the rest
 * run immediately. Streaming output is shown in {@link AIResultPopover}, whose
 * Accept callback applies the result back to the editor.
 *
 * Positioning is owned by the caller — this component only draws the card.
 */
export default function AISelectionMenu({
  selectedText,
  onApply,
  onClose,
}: AISelectionMenuProps) {
  const { run, cancel, isStreaming } = useAI();

  const [view, setView] = useState<View>("list");
  const [activeAction, setActiveAction] = useState<SelectionAction | null>(null);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** The instruction string a run was last started with — used by Retry. */
  const lastInstructionRef = useRef("");

  const startRun = useCallback(
    (action: SelectionAction, runInstruction: string) => {
      setActiveAction(action);
      setView("result");
      setResult("");
      setError(null);
      lastInstructionRef.current = runInstruction;

      run(
        {
          action: action.id,
          input: selectedText,
          instruction: action.instruction ? runInstruction : undefined,
        },
        {
          onDelta: (text) => setResult((prev) => prev + text),
          onDone: () => {
            /* streaming flag flips off via the hook */
          },
          onError: (message) => setError(message),
        },
      );
    },
    [run, selectedText],
  );

  const handleActionClick = useCallback(
    (action: SelectionAction) => {
      if (action.instruction) {
        setActiveAction(action);
        setInstruction("");
        setView("instruction");
        return;
      }
      startRun(action, "");
    },
    [startRun],
  );

  const handleInstructionSubmit = useCallback(() => {
    if (!activeAction) {
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      return;
    }
    startRun(activeAction, trimmed);
  }, [activeAction, instruction, startRun]);

  const handleRetry = useCallback(() => {
    if (!activeAction) {
      return;
    }
    startRun(activeAction, lastInstructionRef.current);
  }, [activeAction, startRun]);

  const backToList = useCallback(() => {
    cancel();
    setActiveAction(null);
    setInstruction("");
    setResult("");
    setError(null);
    setView("list");
  }, [cancel]);

  // --- Result view: hand off entirely to the streaming popover. ---------
  if (view === "result" && activeAction) {
    return (
      <AIResultPopover
        open
        title={activeAction.label}
        result={result}
        isStreaming={isStreaming}
        error={error}
        onAccept={() => {
          onApply(result);
          onClose();
        }}
        onRetry={handleRetry}
        onDiscard={onClose}
      />
    );
  }

  // --- List + instruction views share the bordered floating card. ------
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      role="menu"
      aria-label="AI selection actions"
      className="flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-rule-strong bg-paper-card shadow-[0_28px_64px_-24px_rgba(33,28,22,0.5)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          {view === "instruction" ? (
            <button
              type="button"
              onClick={backToList}
              aria-label="Back to actions"
              className="flex h-5 w-5 items-center justify-center rounded-sm text-ink-faint transition hover:text-ink"
            >
              <FiArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <HiOutlineSparkles
              className="h-3.5 w-3.5 text-clay"
              aria-hidden="true"
            />
          )}
          <p className="eyebrow text-clay">
            {view === "instruction" && activeAction
              ? activeAction.label
              : "Ask AI"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-5 w-5 items-center justify-center rounded-sm text-ink-faint transition hover:text-ink"
        >
          <FiX className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "list" ? (
          <motion.ul
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-col py-1.5"
          >
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleActionClick(action)}
                    className="group flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-sm text-ink transition hover:bg-clay-wash/60"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-rule text-ink-soft transition group-hover:border-clay group-hover:text-clay">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="flex-1 font-medium">{action.label}</span>
                    {action.instruction ? (
                      <FiChevronRight
                        className="h-3.5 w-3.5 text-ink-faint transition group-hover:text-clay"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : (
          <motion.div
            key="instruction"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-col gap-2.5 px-3.5 py-3"
          >
            <p className="eyebrow text-ink-faint">
              {activeAction?.instruction?.prompt}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleInstructionSubmit();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    backToList();
                  }
                }}
                placeholder={activeAction?.instruction?.placeholder}
                className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none"
              />
              <button
                type="button"
                onClick={handleInstructionSubmit}
                disabled={instruction.trim().length === 0}
                className="flex shrink-0 items-center gap-1.5 rounded-sm bg-clay px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-clay"
              >
                <FiCornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Run
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Runs <span className="text-pine">{activeAction?.label}</span> on
              the selected text.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
