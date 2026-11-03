import type * as React from 'react';
import { cn } from '@/utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-shimmer bg-surface-2', className)} {...props} />;
}
