import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Window } from '@/components/retro/Window';
import { PixelIcon } from '@/components/retro/PixelIcon';
import { Progress } from '@/components/ui/progress';
import { progressStats, useProgressStore } from '@/store/progressStore';
import type { PreparedDataset } from '@/types';

/** Watch progress for one anime, stored locally in the browser. */
export function ProgressSummary({ dataset, onJump }: { dataset: PreparedDataset; onJump: (episode: number) => void }) {
  const entry = useProgressStore((s) => s.progress[dataset.slug]);
  const resetAnime = useProgressStore((s) => s.resetAnime);
  const [confirming, setConfirming] = useState(false);
  const total = dataset.episodes.length;
  const stats = progressStats(entry, total);
  const typeOf = new Map(dataset.episodes.map((e) => [e.number, e.type]));
  const nextCanon = progressStats(entry, total, (n) => typeOf.get(n) !== 'FILLER').nextEpisode;

  return (
    <Window title="progress.sav" bodyClassName="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:p-6">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
            <span className="tabular">{stats.watchedCount}</span>
            <span className="text-subtle-foreground"> / </span>
            <span className="tabular">{stats.total}</span>
          </span>
          <span className="text-sm text-muted-foreground">
            watched, <span className="tabular font-semibold text-foreground">{stats.percent}%</span> complete
          </span>
        </p>
        <Progress
          value={(stats.watchedCount / Math.max(1, total)) * 100}
          label={`${stats.percent}% of ${dataset.title} watched`}
          className="mt-3"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {nextCanon && (
          <Button size="sm" onClick={() => onJump(nextCanon)}>
            <Play aria-hidden className="fill-current" />
            {stats.watchedCount ? 'Continue' : 'Start'}: episode {nextCanon}
          </Button>
        )}
        {stats.nextEpisode && stats.nextEpisode !== nextCanon && (
          <Button size="sm" variant="outline" onClick={() => onJump(stats.nextEpisode!)}>
            Next incl. filler: {stats.nextEpisode}
          </Button>
        )}
        {stats.watchedCount > 0 && !confirming && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <RotateCcw aria-hidden />
            Reset progress
          </Button>
        )}
      </div>
      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={`${dataset.slug}-reset-title`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirming(false);
          }}
          className="flex flex-wrap items-center gap-x-4 gap-y-3 border-2 border-edge bg-surface-2 p-3 sm:basis-full"
        >
          <PixelIcon name="warning" size={2} />
          <p id={`${dataset.slug}-reset-title`} className="text-label min-w-0 flex-1">
            Reset all progress for this series? This can’t be undone.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                resetAnime(dataset.slug);
                setConfirming(false);
              }}
              autoFocus
            >
              Confirm reset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Window>
  );
}
