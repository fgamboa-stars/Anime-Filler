import { memo } from 'react';

/** Decorative barcode whose bar widths are derived from the given text. */
export const Barcode = memo(function Barcode({ text, height = 40, className }: { text: string; height?: number; className?: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const code = ch.charCodeAt(0);
    // Three bars per character, widths 1–3 units, gaps 1–2 units.
    for (let i = 0; i < 3; i++) {
      const w = ((code >> (i * 2)) % 3) + 1;
      bars.push({ x, w });
      x += w + ((code >> (i + 1)) % 2) + 1;
    }
  }
  return (
    <svg aria-hidden viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" shapeRendering="crispEdges" className={className}>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} className="fill-current" />
      ))}
    </svg>
  );
});
