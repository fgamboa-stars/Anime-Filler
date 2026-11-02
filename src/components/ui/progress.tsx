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
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-unwatched', className)}
    >
      <div className={cn('h-full rounded-full bg-canon transition-[width] duration-500', indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}
