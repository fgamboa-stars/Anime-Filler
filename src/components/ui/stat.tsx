import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Large figure with a label beneath. Rendered as a dt/dd pair; wrap several in a <dl>. */
export function Stat({
  label,
  value,
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col-reverse gap-1', className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('tabular text-2xl font-semibold tracking-tight sm:text-3xl', valueClassName)}>{value}</dd>
    </div>
  );
}
