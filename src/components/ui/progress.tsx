import { cn } from '@/utils/cn';

interface ProgressProps {
  value: number;
  label: string;
  className?: string;
  indicatorClassName?: string;
}

export function Progress({ value, label, className, indicatorClassName }: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={cn('h-3.5 w-full overflow-hidden border-2 border-edge bg-surface', className)}
    >
      <div
        className={cn('h-full bg-foreground transition-[width] duration-500 motion-reduce:transition-none', indicatorClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
