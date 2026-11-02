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
    <div className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6', className)}>
      <div className="flex items-center gap-2 text-foreground">
        {icon ?? <CircleAlert className="size-5 text-mixed" aria-hidden />}
        <p className="font-semibold">{title}</p>
      </div>
      {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
