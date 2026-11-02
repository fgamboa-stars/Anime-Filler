import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  neutral: { box: 'border-border bg-surface-2', icon: 'text-muted-foreground', Icon: Info },
  info: { box: 'border-info/25 bg-info/[0.06]', icon: 'text-info', Icon: Info },
  warning: { box: 'border-warning/30 bg-warning/[0.07]', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger/25 bg-danger/[0.06]', icon: 'text-danger', Icon: CircleAlert },
  success: { box: 'border-success/25 bg-success/[0.06]', icon: 'text-success', Icon: CircleCheck },
};

interface NoticeProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Heading level/element for the title; defaults to a paragraph. */
  titleAs?: 'p' | 'h2' | 'h3';
  titleId?: string;
}

/** Inline callout for status, caveats and errors. Colour only tints the icon and border; text stays neutral. */
export function Notice({ tone = 'neutral', title, children, icon, actions, className, titleAs: TitleTag = 'p', titleId }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm sm:px-5 sm:py-4', t.box, className)}>
      <span className={cn('mt-0.5 shrink-0 [&_svg]:size-[18px]', t.icon)} aria-hidden>
        {icon ?? <t.Icon />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && (
          <TitleTag id={titleId} className="font-semibold text-foreground">
            {title}
          </TitleTag>
        )}
        {children && <div className="text-muted-foreground [&_p+p]:mt-1">{children}</div>}
        {actions && <div className="flex flex-wrap gap-2 pt-2.5">{actions}</div>}
      </div>
    </div>
  );
}
