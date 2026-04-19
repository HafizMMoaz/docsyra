import { diffLines } from "diff";

export function generateDiff(oldText: string, newText: string): string {
  if (oldText === newText) {
    return '<div class="text-slate-500">No changes</div>';
  }

  const diff = diffLines(oldText, newText);

  return diff
    .map((part) => {
      const value = escapeHtml(part.value).replace(/\n/g, "<br/>");

      if (part.added) {
        return `<span class="diff-add">${value}</span>`;
      }

      if (part.removed) {
        return `<span class="diff-remove">${value}</span>`;
      }

      return `<span>${value}</span>`;
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
