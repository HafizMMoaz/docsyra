"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import SlashCommandList, { type SlashCommandItem, type SlashCommandListHandle } from "@/components/editor/SlashCommandList";

type CreateSlashCommandExtensionInput = {
  commands: SlashCommandItem[];
};

export function createSlashCommandExtension(input: CreateSlashCommandExtensionInput) {
  return Extension.create({
    name: "slash-command",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          allowSpaces: true,
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            return input.commands
              .filter((item) => {
                if (!query) {
                  return true;
                }

                const needle = query.toLowerCase();
                return item.title.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle);
              })
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
