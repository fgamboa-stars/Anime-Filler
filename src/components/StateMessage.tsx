import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { PixelIcon } from '@/components/retro/PixelIcon';
import { Window } from '@/components/retro/Window';
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

/** Status and error messages, styled as a retro "system" dialog. */
export function StateMessage({ title, children, onRetry, action, icon, className }: StateMessageProps) {
  return (
    <Window title="system" className={cn('max-w-2xl', className)} bodyClassName="flex items-start gap-4 p-5 sm:gap-5 sm:p-6">
      <span className="mt-0.5 text-foreground [&_svg]:size-7" aria-hidden>
        {icon ?? <PixelIcon name="warning" size={3} />}
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1.5">
          <p className="text-label text-[13px]">{title}</p>
          {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
        </div>
        {(onRetry || action) && (
          <div className="flex flex-wrap gap-2.5">
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                <RotateCcw aria-hidden />
                Try again
              </Button>
            )}
            {action}
          </div>
        )}
      </div>
    </Window>
  );
}
