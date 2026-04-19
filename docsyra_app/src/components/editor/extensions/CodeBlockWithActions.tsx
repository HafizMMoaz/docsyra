"use client";

import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { useState } from "react";

function CodeBlockView(props: any) {
  const { node } = props;
  const [copied, setCopied] = useState(false);

  const languageLabel = node.attrs?.language ? String(node.attrs.language) : "plain text";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-toolbar">
        <span className="code-block-language">{languageLabel}</span>
        <button type="button" className="code-copy-button" onClick={handleCopy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre>
        <code>
          <NodeViewContent />
        </code>
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithActions = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
