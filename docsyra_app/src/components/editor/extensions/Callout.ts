import { Node } from "@tiptap/core";

export const Callout = Node.create({
  name: "callout",

  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML() {
    return ["div", { "data-callout": "" }, 0];
  },
});
