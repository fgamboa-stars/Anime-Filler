import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SectionHeaderProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** Heading + optional supporting line + right-aligned action, used to open every page section. */
export function SectionHeader({ id, title, description, action, as: Tag = 'h2', className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl space-y-1.5">
        <Tag id={id} className={Tag === 'h1' ? 'text-title' : 'text-heading'}>
          {title}
        </Tag>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
