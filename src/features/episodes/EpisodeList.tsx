import { memo, useState } from 'react';
import { Check, ChevronsUp } from 'lucide-react';
import { EpisodeTypeBadge, TYPE_COLOR_CLASS } from '@/components/EpisodeTypeBadge';
import { Button } from '@/components/ui/button';
import { Window } from '@/components/retro/Window';
import type { Episode } from '@/types';
import { cn } from '@/utils/cn';

interface EpisodeListProps {
  episodes: Episode[];
  watched: ReadonlySet<number>;
  hideTitles: boolean;
  onToggle: (episode: number) => void;
  onMarkUpTo: (episode: number) => void;
  onArcClick: (arcSlug: string) => void;
  /** Episode targeted by the URL hash (#ep-412); the list renders far enough to include it. */
  focusEpisode?: number | null;
}

const PAGE = 100;

export function EpisodeList({ episodes, watched, hideTitles, onToggle, onMarkUpTo, onArcClick, focusEpisode }: EpisodeListProps) {
  const [limit, setLimit] = useState(PAGE);
  const hashIndex = focusEpisode ? episodes.findIndex((e) => e.number === focusEpisode) : -1;
  const shown = episodes.slice(0, Math.max(limit, hashIndex + 20));

  return (
    <div>
      <Window title="episodes.txt" bodyClassName="overflow-hidden">
        <ol className="divide-y divide-border" aria-label="Episodes">
          {shown.map((ep, i) => (
            <EpisodeRow
              key={ep.number}
              ep={ep}
              watched={watched.has(ep.number)}
              hideTitle={hideTitles}
              onToggle={onToggle}
              onMarkUpTo={onMarkUpTo}
              onArcClick={onArcClick}
              showArc={i === 0 || shown[i - 1].arcSlug !== ep.arcSlug}
            />
          ))}
        </ol>
      </Window>
      {shown.length < episodes.length && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show more episodes ({episodes.length - shown.length} left)
          </Button>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  ep: Episode;
  watched: boolean;
  hideTitle: boolean;
  showArc: boolean;
  onToggle: (n: number) => void;
  onMarkUpTo: (n: number) => void;
  onArcClick: (slug: string) => void;
}

const EpisodeRow = memo(function EpisodeRow({ ep, watched, hideTitle, showArc, onToggle, onMarkUpTo, onArcClick }: RowProps) {
  const checkboxId = `watched-${ep.number}`;
  return (
    <li
      id={`ep-${ep.number}`}
      className={cn(
        'content-auto group relative flex min-h-16 scroll-mt-24 items-center gap-3 py-3 pr-2 pl-4 transition-colors hover:bg-surface-2/60 sm:gap-4 sm:pr-3 sm:pl-5',
        watched && 'bg-surface-2/40',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', TYPE_COLOR_CLASS[ep.type], watched && 'opacity-40')} />
      <div className="relative flex shrink-0 items-center">
        <input
          id={checkboxId}
          type="checkbox"
          checked={watched}
          onChange={() => onToggle(ep.number)}
          className="peer size-6 cursor-pointer appearance-none border-2 border-input bg-surface transition-colors hover:border-foreground checked:border-foreground checked:bg-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto size-4 text-background opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden
        />
      </div>
      <span
        className={cn(
          'tabular w-9 shrink-0 text-right text-base font-bold sm:w-12',
          watched ? 'text-subtle-foreground' : 'text-foreground',
        )}
      >
        {ep.number}
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={checkboxId} className="block cursor-pointer">
          <span className="sr-only">
            {watched ? 'Watched: ' : 'Mark watched: '}episode {ep.number},{' '}
          </span>
          <span
            className={cn(
              'line-clamp-2 text-[15px] font-medium transition-[filter] sm:truncate',
              watched && 'text-muted-foreground',
              hideTitle && 'blur-[6px] select-none group-hover:blur-none group-focus-within:blur-none',
            )}
          >
            {ep.title}
          </span>
        </label>
        {showArc && (
          <button
            type="button"
            onClick={() => onArcClick(ep.arcSlug)}
            className="mt-0.5 max-w-full truncate text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {ep.arc}
          </button>
        )}
      </div>
      <EpisodeTypeBadge type={ep.type} compact className="shrink-0 px-1.5 py-1 sm:px-2.5 sm:py-0.5" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-subtle-foreground group-hover:text-foreground focus-visible:text-foreground"
        onClick={() => onMarkUpTo(ep.number)}
        aria-label={`Mark episodes 1 to ${ep.number} watched`}
        title={`Mark 1–${ep.number} watched`}
      >
        <ChevronsUp aria-hidden />
      </Button>
    </li>
  );
});
