"use client";

import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import DragHandle from "@tiptap/extension-drag-handle";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { common, createLowlight } from "lowlight";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import "tippy.js/dist/tippy.css";
import type { SlashCommandItem } from "@/components/editor/SlashCommandList";
import { SlashCommand } from "@/components/editor/extensions/SlashCommand";
import BlockWrapper from "@/components/editor/extensions/BlockWrapper";
import { ResizableImage } from "@/components/editor/extensions/ResizableImage";
import { Callout } from "@/components/editor/extensions/Callout";
import { CodeBlockWithActions } from "@/components/editor/extensions/CodeBlockWithActions";
import { CommentMark } from "@/components/editor/extensions/CommentMark";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const lowlight = createLowlight(common);

const CustomParagraph = Paragraph.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockWrapper);
  },
});

const CustomHeading = Heading.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockWrapper);
  },
});

const CustomBulletList = BulletList.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockWrapper);
  },
});

const CustomOrderedList = OrderedList.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockWrapper);
  },
});

type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  onCommentSelectionChange?: (selection: { from: number; to: number; text: string; contextBefore: string; contextAfter: string } | null) => void;
  onPresenceStateChange?: (presence: { cursor?: { anchor: number; head: number } | null; typing?: boolean; contextLabel?: string | null }) => void;
  highlightedPresenceId?: string | null;
  focusedRemoteCursor?: { id: string; pos: number; key: number } | null;
  remotePresenceCursors?: Array<{
    id: string;
    name: string;
    color: string;
    cursor: { anchor: number; head: number } | null;
    dimmed?: boolean;
  }>;
  onCommentMarkClick?: (threadId: string, anchorRect?: { left: number; top: number; right: number; bottom: number }) => void;
  commentAnchors?: Array<{ threadId: string; from: number; to: number; quote?: string | null; contextBefore?: string | null; contextAfter?: string | null }>;
  focusCommentTarget?: { threadId: string; from: number; to: number; key: number } | null;
  disabled?: boolean;
  documentId?: string;
  csrfToken?: string;
  pendingCommentAnchor?: { threadId: string; range: { from: number; to: number } } | null;
  activeCommentThreadId?: string | null;
  collaboration?: {
    doc: Y.Doc;
    awareness: Awareness;
    user: {
      name: string;
      color: string;
    };
  };
};

function cleanImages(html: string): string {
  return html.replace(/src="data:image[^"]+"/g, "src=\"\"");
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function getSelectionContext(doc: ProseMirrorNode, from: number, to: number): { contextBefore: string; contextAfter: string } {
  const contextWindow = 40;
  const beforeStart = Math.max(0, from - contextWindow);
  const afterEnd = Math.min(doc.content.size, to + contextWindow);

  return {
    contextBefore: normalizeText(doc.textBetween(beforeStart, from, " ")),
    contextAfter: normalizeText(doc.textBetween(to, afterEnd, " ")),
  };
}

function buildNormalizedDocIndex(doc: ProseMirrorNode): { text: string; positions: number[] } {
  const text: string[] = [];
  const positions: number[] = [];
  let pendingSpacePosition: number | null = null;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    for (let index = 0; index < node.text.length; index += 1) {
      const character = node.text[index];
      const absolutePosition = pos + index;

      if (/\s/.test(character)) {
        if (text.length > 0) {
          pendingSpacePosition = pendingSpacePosition ?? absolutePosition;
        }
        continue;
      }

      if (pendingSpacePosition !== null && text.length > 0) {
        text.push(" ");
        positions.push(pendingSpacePosition);
        pendingSpacePosition = null;
      }

      text.push(character);
      positions.push(absolutePosition);
    }

    pendingSpacePosition = pendingSpacePosition ?? (text.length > 0 ? pos + node.text.length : null);
    return true;
  });

  return {
    text: text.join(""),
    positions,
  };
}

function findRangeByAnchor(
  doc: ProseMirrorNode,
  anchor: { quote?: string | null; contextBefore?: string | null; contextAfter?: string | null },
): { from: number; to: number } | null {
  const needle = normalizeText(anchor.quote ?? "");
  if (!needle) {
    return null;
  }

  const index = buildNormalizedDocIndex(doc);
  const haystack = index.text;
  const positions = index.positions;
  const normalizedBefore = normalizeText(anchor.contextBefore ?? "");
  const normalizedAfter = normalizeText(anchor.contextAfter ?? "");

  const candidateIndexes: number[] = [];
  let cursor = 0;
  while (cursor < haystack.length) {
    const matchIndex = haystack.toLowerCase().indexOf(needle.toLowerCase(), cursor);
    if (matchIndex < 0) {
      break;
    }

    candidateIndexes.push(matchIndex);
    cursor = matchIndex + 1;
  }

  if (candidateIndexes.length === 0) {
    return null;
  }

  const scoredCandidates = candidateIndexes
    .map((matchIndex) => {
      const quoteEnd = matchIndex + needle.length;
      const beforeSlice = haystack.slice(Math.max(0, matchIndex - normalizedBefore.length), matchIndex);
      const afterSlice = haystack.slice(quoteEnd, quoteEnd + normalizedAfter.length);

      let score = 0;
      if (normalizedBefore && beforeSlice.endsWith(normalizedBefore)) {
        score += 2;
      }

      if (normalizedAfter && afterSlice.startsWith(normalizedAfter)) {
        score += 2;
      }

      return { matchIndex, score };
    })
    .sort((left, right) => right.score - left.score || left.matchIndex - right.matchIndex);

  const matchIndex = scoredCandidates[0]?.matchIndex;
  if (matchIndex === undefined) {
    return null;
  }

  const from = positions[Math.min(matchIndex, positions.length - 1)] ?? 1;
  const endIndex = Math.min(matchIndex + needle.length - 1, positions.length - 1);
  const to = (positions[endIndex] ?? from) + 1;

  if (from >= to) {
    return null;
  }

  return { from, to };
}

export default function RichTextEditor({
  value,
  onChange,
  onCommentSelectionChange,
  onPresenceStateChange,
  highlightedPresenceId,
  focusedRemoteCursor,
  remotePresenceCursors = [],
  onCommentMarkClick,
  commentAnchors = [],
  focusCommentTarget,
  disabled = false,
  documentId,
  csrfToken,
  pendingCommentAnchor,
  activeCommentThreadId,
  collaboration,
}: RichTextEditorProps) {
  const markdownToHtml = useMemo(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    return (markdown: string) => marked.parse(markdown || "", { async: false }) as string;
  }, []);

  const turndown = useMemo(() => {
    const service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "_",
      strongDelimiter: "**",
    });

    service.use(gfm);
    return service;
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string>(value || "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [remoteCursorOverlays, setRemoteCursorOverlays] = useState<Array<{ id: string; name: string; color: string; x: number; y: number; dimmed: boolean }>>([]);
  const [isDocumentEmpty, setIsDocumentEmpty] = useState((value || "").trim().length === 0);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [commandStats, setCommandStats] = useState<Record<string, number>>({});

  const getContextLabel = useCallback((nextEditor: Editor): string | null => {
    const { $anchor } = nextEditor.state.selection;
    for (let depth = $anchor.depth; depth >= 0; depth -= 1) {
      const node = $anchor.node(depth);
      if (node.isTextblock) {
        const fullText = node.textContent.trim();
        if (fullText.length > 0) {
          const snippet = fullText.slice(0, 56);
          return `\"${snippet}${fullText.length > 56 ? "..." : ""}\"`;
        }
      }
    }

    return "this section";
  }, []);

  useEffect(() => {
    const rawRecent = window.localStorage.getItem("recentCommands");
    if (!rawRecent) {
      return;
    }

    try {
      const parsed = JSON.parse(rawRecent) as string[];
      if (Array.isArray(parsed)) {
        setRecentCommands(parsed.filter((item) => typeof item === "string").slice(0, 6));
      }
    } catch {
      setRecentCommands([]);
    }
  }, []);

  useEffect(() => {
    const rawStats = window.localStorage.getItem("commandStats");
    if (!rawStats) {
      return;
    }

    try {
      const parsed = JSON.parse(rawStats) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        setCommandStats(parsed);
      }
    } catch {
      setCommandStats({});
    }
  }, []);

  const rememberCommand = useCallback((title: string) => {
    setRecentCommands((current) => {
      const updated = [title, ...current.filter((item) => item !== title)].slice(0, 6);
      window.localStorage.setItem("recentCommands", JSON.stringify(updated));
      return updated;
    });

    setCommandStats((current) => {
      const updated = {
        ...current,
        [title]: (current[title] ?? 0) + 1,
      };
      window.localStorage.setItem("commandStats", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const slashCommands = useMemo<SlashCommandItem[]>(() => {
    const run = (title: string, fn: (editor: Editor) => void) => () => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      fn(editor);
      rememberCommand(title);
    };

    return [
      {
        group: "Basic",
        icon: "T",
        title: "Text",
        description: "Start writing with plain text",
        run: run("Text", (editor) => editor.chain().focus().setParagraph().run()),
      },
      {
        group: "Basic",
        icon: "H1",
        title: "Heading",
        description: "Large section heading",
        run: run("Heading", (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()),
      },
      {
        group: "Basic",
        icon: "H2",
        title: "Heading 2",
        description: "Medium section heading",
        run: run("Heading 2", (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()),
      },
      {
        group: "Basic",
        icon: "•",
        title: "Bulleted list",
        description: "Create a bullet list",
        run: run("Bulleted list", (editor) => editor.chain().focus().toggleBulletList().run()),
      },
      {
        group: "Basic",
        icon: "1.",
        title: "Numbered list",
        description: "Create an ordered list",
        run: run("Numbered list", (editor) => editor.chain().focus().toggleOrderedList().run()),
      },
      {
        group: "Basic",
        icon: "❝",
        title: "Quote",
        description: "Insert a block quote",
        run: run("Quote", (editor) => editor.chain().focus().toggleBlockquote().run()),
      },
      {
        group: "Media",
        icon: "🖼",
        title: "Image",
        description: "Upload an image",
        run: () => {
          rememberCommand("Image");
          fileInputRef.current?.click();
        },
      },
      {
        group: "Advanced",
        icon: "—",
        title: "Divider",
        description: "Insert a horizontal divider",
        run: run("Divider", (editor) => editor.chain().focus().setHorizontalRule().run()),
      },
      {
        group: "Advanced",
        icon: "</>",
        title: "Code Block",
        description: "Insert a highlighted code block",
        run: run("Code Block", (editor) => editor.chain().focus().toggleCodeBlock().run()),
      },
      {
        group: "Advanced",
        icon: "💡",
        title: "Callout",
        description: "Insert a callout block",
        run: run("Callout", (editor) =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "callout",
              content: [{ type: "text", text: "Add your note..." }],
            })
            .run(),
        ),
      },
      {
        group: "Advanced",
        icon: "Tbl",
        title: "Table",
        description: "Insert a 3x3 table",
        run: run("Table", (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
      },
    ];
  }, [rememberCommand]);

  const slashExtension = useMemo(
    () => SlashCommand({ commands: slashCommands, recentCommands, commandStats }),
    [commandStats, recentCommands, slashCommands],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: markdownToHtml(value || ""),
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        codeBlock: false,
        undoRedo: collaboration ? false : {},
      }),
      CustomParagraph,
      CustomHeading,
      CustomBulletList,
      CustomOrderedList,
      ResizableImage,
      HorizontalRule,
      CodeBlockWithActions.configure({
        lowlight,
      }),
      Callout,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
      Placeholder.configure({
        placeholder: "Type '/' for commands...",
      }),
      DragHandle.configure({
        render: () => {
          const el = document.createElement("div");
          el.className = "drag-handle";
          el.innerText = "⋮⋮";
          return el;
        },
        onNodeChange: ({ node }) => {
          void node;
        },
      }),
      slashExtension,
      ...(collaboration
        ? [
            Collaboration.configure({
              document: collaboration.doc,
              field: "content",
            }),
            CollaborationCursor.configure({
              provider: {
                awareness: collaboration.awareness,
              },
              user: {
                name: collaboration.user.name,
                color: collaboration.user.color,
              },
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none outline-none",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const sanitizedHtml = cleanImages(nextEditor.getHTML());
      const markdown = turndown.turndown(sanitizedHtml).trimEnd();
      lastEmittedRef.current = markdown;
      setIsDocumentEmpty(nextEditor.isEmpty);
      onChange(markdown);
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const { from, to, empty } = nextEditor.state.selection;
      onPresenceStateChange?.({
        cursor: {
          anchor: from,
          head: to,
        },
        contextLabel: getContextLabel(nextEditor),
      });

      if (!onCommentSelectionChange) {
        return;
      }

      if (empty || from === to) {
        onCommentSelectionChange(null);
        return;
      }

      const selectedText = nextEditor.state.doc.textBetween(from, to, " ").trim();
      const context = getSelectionContext(nextEditor.state.doc, from, to);
      onCommentSelectionChange({ from, to, text: selectedText, ...context });
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      onPresenceStateChange?.({ typing: true });
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(() => {
        onPresenceStateChange?.({ typing: false, contextLabel: null });
      }, 1200);

      const hasCommandModifier = event.metaKey || event.ctrlKey;
      if (!hasCommandModifier) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        editor.chain().focus().insertContent("/").run();
        return;
      }

      if (event.key.toLowerCase() === "d") {
        event.preventDefault();

        const { state, view } = editor;
        const { $from } = state.selection;
        if ($from.depth === 0) {
          return;
        }

        const blockPos = $from.before($from.depth);
        const blockNode = state.doc.nodeAt(blockPos);
        if (!blockNode) {
          return;
        }

        const transaction = state.tr.insert(blockPos + blockNode.nodeSize, blockNode.copy(blockNode.content));
        view.dispatch(transaction.scrollIntoView());
      }
    };

    const domElement = editor.view.dom;
    domElement.addEventListener("keydown", handleKeyDown);

    return () => {
      domElement.removeEventListener("keydown", handleKeyDown);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      onPresenceStateChange?.({ typing: false, contextLabel: null });
    };
  }, [disabled, editor, onPresenceStateChange]);

  useEffect(() => {
    if (!editor || !pendingCommentAnchor) {
      return;
    }

    const docSize = editor.state.doc.content.size;
    const from = Math.max(1, Math.min(pendingCommentAnchor.range.from, docSize));
    const to = Math.max(from + 1, Math.min(pendingCommentAnchor.range.to, docSize));

    if (from >= to) {
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .setComment({ id: pendingCommentAnchor.threadId })
      .setTextSelection(to)
      .run();
  }, [editor, pendingCommentAnchor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const markType = editor.schema.marks.comment;
    if (!markType) {
      return;
    }

    const docSize = editor.state.doc.content.size;
    const transaction = editor.state.tr;
    transaction.removeMark(0, docSize, markType);

    for (const anchor of commentAnchors) {
      const preferredFrom = Math.max(1, Math.min(anchor.from, docSize));
      const preferredTo = Math.max(preferredFrom + 1, Math.min(anchor.to, docSize));
      const preferredText = normalizeText(editor.state.doc.textBetween(preferredFrom, preferredTo, " "));
      const expectedQuote = normalizeText(anchor.quote ?? "");

      const resolvedRange = expectedQuote && preferredText !== expectedQuote
        ? findRangeByAnchor(editor.state.doc, {
            quote: anchor.quote,
            contextBefore: anchor.contextBefore,
            contextAfter: anchor.contextAfter,
          })
        : { from: preferredFrom, to: preferredTo };

      if (!resolvedRange) {
        continue;
      }

      const from = Math.max(1, Math.min(resolvedRange.from, docSize));
      const to = Math.max(from + 1, Math.min(resolvedRange.to, docSize));

      if (from >= to) {
        continue;
      }

      transaction.addMark(from, to, markType.create({ id: anchor.threadId }));
    }

    if (!transaction.docChanged) {
      return;
    }

    editor.view.dispatch(transaction);
  }, [commentAnchors, editor, value]);

  useEffect(() => {
    if (!editor || !onCommentMarkClick) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const element = target.closest("[data-comment-id]");
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const threadId = element.dataset.commentId;
      if (!threadId) {
        return;
      }

      event.stopPropagation();
      const pos = editor.view.posAtDOM(element, 0);
      const rect = editor.view.coordsAtPos(pos);
      onCommentMarkClick(threadId, {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      });
    };

    const domElement = editor.view.dom;
    domElement.addEventListener("click", handleClick);

    return () => {
      domElement.removeEventListener("click", handleClick);
    };
  }, [editor, onCommentMarkClick]);

  useEffect(() => {
    if (!editor || !focusCommentTarget) {
      return;
    }

    const docSize = editor.state.doc.content.size;
    const from = Math.max(1, Math.min(focusCommentTarget.from, docSize));
    const to = Math.max(from + 1, Math.min(focusCommentTarget.to, docSize));

    editor.chain().focus().setTextSelection({ from, to }).run();
    editor.view.dispatch(editor.state.tr.scrollIntoView());
  }, [editor, focusCommentTarget]);

  useEffect(() => {
    if (!editor) {
      setRemoteCursorOverlays([]);
      return;
    }

    const buildOverlays = () => {
      const docSize = editor.state.doc.content.size;
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
      const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;

      const overlays = remotePresenceCursors
        .filter((peer) => peer.cursor)
        .map((peer) => {
          const head = Math.max(1, Math.min(peer.cursor?.head ?? 1, docSize));
          const rect = editor.view.coordsAtPos(head);

          return {
            id: peer.id,
            name: peer.name,
            color: peer.color,
            x: viewportWidth > 0 ? Math.min(viewportWidth - 160, Math.max(12, rect.left + 8)) : rect.left + 8,
            y: viewportHeight > 0 ? Math.min(viewportHeight - 28, Math.max(8, rect.top - 22)) : rect.top - 22,
            dimmed: Boolean(peer.dimmed),
          };
        });

      setRemoteCursorOverlays(overlays);
    };

    buildOverlays();

    const schedule = () => {
      window.requestAnimationFrame(buildOverlays);
    };

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, remotePresenceCursors, value]);

  useEffect(() => {
    if (!editor || !focusedRemoteCursor) {
      return;
    }

    const docSize = editor.state.doc.content.size;
    const pos = Math.max(1, Math.min(focusedRemoteCursor.pos, docSize));
    const rect = editor.view.coordsAtPos(pos);
    const targetY = window.scrollY + rect.top - window.innerHeight * 0.35;
    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: "smooth",
    });
  }, [editor, focusedRemoteCursor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const marks = editor.view.dom.querySelectorAll("[data-comment-id]");
    marks.forEach((markNode) => {
      if (!(markNode instanceof HTMLElement)) {
        return;
      }

      const isActive = Boolean(activeCommentThreadId) && markNode.dataset.commentId === activeCommentThreadId;
      markNode.classList.toggle("comment-mark-active", isActive);
    });
  }, [activeCommentThreadId, editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const incoming = value || "";
    if (incoming === lastEmittedRef.current) {
      return;
    }

    const hasCollabDoc = collaboration && collaboration.doc.getXmlFragment("content").length > 0;
    if (hasCollabDoc) {
      return;
    }

    editor.commands.setContent(markdownToHtml(incoming), { emitUpdate: false });
    lastEmittedRef.current = incoming;
    setIsDocumentEmpty(editor.isEmpty);
  }, [collaboration, editor, markdownToHtml, value]);

  async function handleImageUpload(file: File | null): Promise<void> {
    if (!file || !editor) {
      return;
    }

    setEditorError(null);
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/image", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken ?? "",
        },
        body: formData,
      });

      const data = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Image upload failed");
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: "resizableImage",
          attrs: {
            src: data.url,
            alt: "",
            width: "100%",
            caption: "",
          },
        })
        .run();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (!editor) {
    return <div className="min-h-100 rounded-sm border border-rule-strong bg-paper-card p-4 font-display text-sm italic text-ink-faint">Loading editor…</div>;
  }

  return (
    <div className="rounded-sm border border-rule-strong bg-paper-card">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleImageUpload(event.target.files?.[0] ?? null);
        }}
      />

      {editorError ? <p className="px-4 pt-2 text-sm text-signal-danger">{editorError}</p> : null}

      {editor && !disabled ? (
        <BubbleMenu editor={editor}>
          <div className="bubble-menu">
            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}>
              B
            </button>
            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>
              I
            </button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              H1
            </button>
          </div>
        </BubbleMenu>
      ) : null}

      {isDocumentEmpty ? (
        <div className="empty-doc-hint">Start writing or type &apos;/&apos;...</div>
      ) : null}

      {remoteCursorOverlays.map((overlay) => {
        const isHighlighted = highlightedPresenceId === overlay.id;

        return (
          <div
            key={`presence-overlay-${overlay.id}`}
            className={`pointer-events-none fixed z-30 rounded-sm px-2 py-0.5 text-[11px] font-semibold text-white shadow ${overlay.dimmed ? "opacity-35" : "opacity-90"} ${isHighlighted ? "ring-2 ring-clay opacity-100" : ""}`}
            style={{
              left: overlay.x,
              top: overlay.y,
              backgroundColor: overlay.color,
            }}
          >
            {overlay.name}
          </div>
        );
      })}

      <div className="px-4 pb-4 pt-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
