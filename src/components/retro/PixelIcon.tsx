import { memo } from 'react';
import { cn } from '@/utils/cn';

/** Bitmaps: "X" = ink (currentColor), "o" = paper (surface), space = transparent. */
const ICONS = {
  smiley: [
    '    XXXXX    ',
    '  XXoooooXX  ',
    ' XoooooooooX ',
    ' XooXoooXooX ',
    'XoooXoooXoooX',
    'XoooooooooooX',
    'XoooooooooooX',
    'XooXoooooXooX',
    ' XooXoooXooX ',
    ' XoooXXXoooX ',
    '  XXoooooXX  ',
    '    XXXXX    ',
  ],
  hourglass: [
    'XXXXXXXXXXX',
    ' XoooooooX ',
    ' XoooooooX ',
    '  XoXXXoX  ',
    '   XoXoX   ',
    '    XoX    ',
    '     X     ',
    '    XoX    ',
    '   XoooX   ',
    '  XooXooX  ',
    ' XooXXXooX ',
    ' XoXXXXXoX ',
    'XXXXXXXXXXX',
  ],
  warning: [
    '      XX      ',
    '     XXXX     ',
    '     XXXX     ',
    '    XXooXX    ',
    '    XXooXX    ',
    '   XXXooXXX   ',
    '   XXXooXXX   ',
    '  XXXXooXXXX  ',
    '  XXXXXXXXXX  ',
    ' XXXXXooXXXXX ',
    ' XXXXXooXXXXX ',
    'XXXXXXXXXXXXXX',
  ],
} as const;

export type PixelIconName = keyof typeof ICONS;

/** Crisp pixel-art icon drawn from a bitmap; scales by whole pixels via `size`. */
export const PixelIcon = memo(function PixelIcon({
  name,
  size = 3,
  className,
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
}) {
  const rows = ICONS[name];
  const w = Math.max(...rows.map((r) => r.length));
  const rects: { x: number; y: number; w: number; ink: boolean }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === 'X' || c === 'o') {
        let x2 = x;
        while (x2 < row.length && row[x2] === c) x2++;
        rects.push({ x, y, w: x2 - x, ink: c === 'X' });
        x = x2;
      } else x++;
    }
  });
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${rows.length}`}
      width={w * size}
      height={rows.length * size}
      shapeRendering="crispEdges"
      className={cn('shrink-0', className)}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} className={r.ink ? 'fill-current' : 'fill-surface'} />
      ))}
    </svg>
  );
});
