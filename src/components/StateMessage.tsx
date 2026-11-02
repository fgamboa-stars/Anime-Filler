import type { ReactNode } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AniListError } from '@/services/anilist';
import { cn } from '@/utils/cn';

export function describeError(error: Error | null | undefined): string {
  if (error instanceof AniListError) {
    switch (error.kind) {
      case 'rate-limit':
        return `AniList is limiting requests right now. Try again in ${error.retryAfter ?? 60} seconds.`;
      case 'network':
        return 'AniList couldn’t be reached. Check your connection and try again.';
      case 'not-found':
        return 'AniList has no anime with this ID.';
      default:
        return 'AniList returned an error. Try again in a moment.';
    }
  }
  return error?.message || 'Something went wrong.';
}

interface StateMessageProps {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function StateMessage({ title, children, onRetry, action, icon, className }: StateMessageProps) {
  return (
    <div className={cn('surface-card flex flex-col items-start gap-4 p-6 sm:p-8', className)}>
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-2 [&_svg]:size-5" aria-hidden>
        {icon ?? <CircleAlert className="text-warning" />}
      </span>
      <div className="space-y-1.5">
        <p className="text-subheading">{title}</p>
        {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
      </div>
      {(onRetry || action) && (
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
