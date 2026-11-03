import { cn } from '@/utils/cn';

interface ShareBarProps {
  /** 0–100. */
  value: number;
  /** Fill colour class, e.g. "bg-filler". */
  barClassName?: string;
  /** Edged track (stand-alone bars) or a plain track (inside legends). */
  framed?: boolean;
  className?: string;
}

/**
 * Horizontal bar on a fixed 0–100% scale. Decorative: the value it shows must also be
 * printed as text next to it, so it is hidden from assistive tech.
 */
export function ShareBar({ value, barClassName = 'bg-foreground', framed = false, className }: ShareBarProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      aria-hidden
      className={cn('relative w-full overflow-hidden ', framed ? 'h-3.5 border-2 border-edge bg-surface' : 'h-1.5 bg-track', className)}
    >
      <div
        className={cn('absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none', barClassName)}
        style={{ width: v > 0 ? `max(${v}%, 4px)` : 0 }}
      />
    </div>
  );
}
