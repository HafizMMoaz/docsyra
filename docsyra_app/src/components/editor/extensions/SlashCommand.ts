"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import SlashCommandList, {
  type SlashCommandItem,
  type SlashCommandListHandle,
} from "@/components/editor/SlashCommandList";

type CreateSlashCommandExtensionInput = {
  commands: SlashCommandItem[];
  recentCommands?: string[];
  commandStats?: Record<string, number>;
};

function fuzzyScore(text: string, query: string): number {
  const candidate = text.toLowerCase();
  const needle = query.toLowerCase().trim();

  if (!needle) {
    return 1;
  }

  const includesIndex = candidate.indexOf(needle);
  if (includesIndex >= 0) {
    return 100 - includesIndex;
  }

  let queryIndex = 0;
  let score = 0;

  for (let index = 0; index < candidate.length && queryIndex < needle.length; index += 1) {
    if (candidate[index] === needle[queryIndex]) {
      score += 2;
      queryIndex += 1;
    }
  }

  return queryIndex === needle.length ? score : 0;
}

export function SlashCommand(input: CreateSlashCommandExtensionInput) {
  return Extension.create({
    name: "slash-command",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          allowSpaces: true,
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            const normalizedQuery = query.trim();

            if (!normalizedQuery) {
              const recentTitles = input.recentCommands ?? [];
              const stats = input.commandStats ?? {};
              const recentSet = new Set(recentTitles);
              const recentScore = new Map(recentTitles.map((title, index) => [title, recentTitles.length - index]));

              const recentItems = recentTitles
                .map((title) => input.commands.find((item) => item.title === title))
                .filter((item): item is SlashCommandItem => Boolean(item));
              const rankedOthers = input.commands
                .filter((item) => !recentSet.has(item.title))
                .map((item) => ({
                  item,
                  score: (stats[item.title] ?? 0) * 10 + (recentScore.get(item.title) ?? 0),
                }))
                .sort((left, right) => right.score - left.score)
                .map((entry) => entry.item);

              return [...recentItems, ...rankedOthers].slice(0, 8);
            }

            return input.commands
              .map((item) => {
                const titleScore = fuzzyScore(item.title, normalizedQuery);
                const descriptionScore = Math.max(0, fuzzyScore(item.description, normalizedQuery) - 5);
                return { item, score: Math.max(titleScore, descriptionScore) };
              })
              .filter((entry) => entry.score > 0)
              .sort((left, right) => right.score - left.score)
              .map((entry) => entry.item)
              .slice(0, 8);
          },
          command: ({ editor, range, props }: { editor: any; range: { from: number; to: number }; props: SlashCommandItem }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run();
          },
          render: () => {
            let reactRenderer: ReactRenderer<SlashCommandListHandle> | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: any) => {
                reactRenderer = new ReactRenderer(SlashCommandList, {
                  props: {
                    items: props.items,
                    command: (item: SlashCommandItem) => props.command(item),
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: reactRenderer.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },

              onUpdate(props: any) {
                reactRenderer?.updateProps({
                  items: props.items,
                  command: (item: SlashCommandItem) => props.command(item),
                });

                if (!props.clientRect || !popup?.[0]) {
                  return;
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },

              onKeyDown(props: SuggestionKeyDownProps) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }

                return reactRenderer?.ref?.onKeyDown(props.event) ?? false;
              },

              onExit() {
                popup?.[0]?.destroy();
                reactRenderer?.destroy();
              },
            };
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...(this.options.suggestion as Record<string, unknown>),
        }),
      ];
    },
  });
}
