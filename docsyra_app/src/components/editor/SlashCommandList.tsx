"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type SlashCommandItem = {
  title: string;
  description: string;
  icon: string;
  group: string;
  run: () => void;
};

export type SlashCommandListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SlashCommandListProps = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
};

const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (items.length === 0) {
          return false;
        }

        if (event.key === "ArrowUp") {
          setSelectedIndex((currentIndex) => (currentIndex + items.length - 1) % items.length);
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((currentIndex) => (currentIndex + 1) % items.length);
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === "Home") {
          setSelectedIndex(0);
          return true;
        }

        if (event.key === "End") {
          setSelectedIndex(items.length - 1);
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="slash-menu max-h-80 w-72 overflow-auto">
          <p className="slash-hint">Type a command or select below...</p>
          <p className="px-2 py-1 text-sm text-ink-faint">No commands found</p>
        </div>
      );
    }

    return (
      <div className="slash-menu max-h-80 w-72 overflow-auto">
        <p className="slash-hint">Type a command or select below...</p>
        {items.map((item, index) => (
          <div key={`${item.group}-${item.title}`}>
            {index === 0 || item.group !== items[index - 1]?.group ? (
              <div className="slash-group">{item.group}</div>
            ) : null}
            <button
              type="button"
              className={`slash-item w-full text-left ${index === selectedIndex ? "active" : ""}`}
              onClick={() => selectItem(index)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className={`slash-icon ${index === selectedIndex ? "active" : ""}`}>{item.icon}</span>
                <span>{item.title}</span>
              </span>
              <span className={`slash-description ${index === selectedIndex ? "active" : ""}`}>{item.description}</span>
            </button>
          </div>
        ))}
      </div>
    );
  },
);

export default SlashCommandList;
