"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

export default function BlockWrapper(props: any) {
  const { editor, selected } = props;
  const [hovered, setHovered] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const insertBlock = () => {
    editor.chain().focus().insertContent({
      type: "paragraph",
    }).run();
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = window.setTimeout(() => {
      setHovered(true);
    }, 80);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    setHovered(false);
  };

  return (
    <NodeViewWrapper
      className={`block-wrapper ${selected ? "selected" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`block-controls ${hovered ? "visible" : ""}`}>
        <button className="block-add" type="button" onClick={insertBlock}>
          +
        </button>
      </div>

      <div className="block-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}
