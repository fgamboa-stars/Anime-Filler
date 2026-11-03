import type { ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface WindowProps {
  /** File-name style caption for the title bar, e.g. "filler.stats". Decorative. */
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Render as a different element (e.g. "section" with aria-labelledby). */
  as?: 'div' | 'section' | 'figure';
  'aria-labelledby'?: string;
  'aria-label'?: string;
}

/**
 * Retro window: a black title bar with a file-name caption and inert window controls,
 * over an edged body with a hard shadow. The title bar is decoration, so it is hidden
 * from assistive tech; real headings live inside the body.
 */
export function Window({ title, children, className, bodyClassName, as: Tag = 'div', ...aria }: WindowProps) {
  return (
    <Tag className={cn('panel flex flex-col', className)} {...aria}>
      <div aria-hidden className="flex h-8 shrink-0 items-center justify-between gap-3 bg-primary px-3 text-primary-foreground">
        <span className="text-label truncate">{title}</span>
        <span className="flex gap-1.5">
          {[Minus, Square, X].map((Icon, i) => (
            <span key={i} className="flex size-4 items-center justify-center border-[1.5px] border-primary-foreground">
              <Icon className="size-2.5" strokeWidth={3.5} />
            </span>
          ))}
        </span>
      </div>
      <div className={cn('min-w-0 flex-1', bodyClassName)}>{children}</div>
    </Tag>
  );
}
