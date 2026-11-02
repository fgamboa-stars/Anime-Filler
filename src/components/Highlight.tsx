import type { ReactNode } from 'react';
import type { RangeTuple } from 'fuse.js';

/** Render text with matched ranges wrapped in <mark>. */
export function Highlight({ text, ranges }: { text: string; ranges: readonly RangeTuple[] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className="rounded-[2px] bg-transparent text-foreground underline decoration-ring decoration-2 underline-offset-[3px]">
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
