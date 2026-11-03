import { cn } from '@/utils/cn';

/** Red sticker with a jagged edge, in the site's filler red. */
export function Starburst({ children, className }: { children: React.ReactNode; className?: string }) {
  const points = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r = i % 2 === 0 ? 50 : 41;
    return `${(50 + r * Math.sin(a)).toFixed(2)},${(50 - r * Math.cos(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <div className={cn('relative grid place-items-center', className)}>
      <svg aria-hidden viewBox="-2 -2 104 104" className="absolute inset-0 size-full">
        <polygon points={points} className="fill-filler stroke-foreground" strokeWidth={2.5} strokeLinejoin="miter" />
      </svg>
      <span className="relative text-center font-[family-name:var(--font-display)] leading-[0.9] text-white uppercase">{children}</span>
    </div>
  );
}
