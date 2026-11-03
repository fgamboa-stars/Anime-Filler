import { memo, useMemo } from 'react';
import type { EpisodeType, EpisodeTypeCounts } from '@/types';
import { TYPE_LABELS } from '@/utils/dataset';
import { cn } from '@/utils/cn';
import { TYPE_COLOR_CLASS } from './EpisodeTypeBadge';

interface Run {
  type: EpisodeType;
  start: number;
  end: number;
}

function toRuns(episodes: { number: number; type: EpisodeType }[]): Run[] {
  const runs: Run[] = [];
  for (const ep of episodes) {
    const last = runs[runs.length - 1];
    if (last && last.type === ep.type && ep.number === last.end + 1) last.end = ep.number;
    else runs.push({ type: ep.type, start: ep.number, end: ep.number });
  }
  return runs;
}

interface EpisodeStripProps {
  episodes: { number: number; type: EpisodeType }[];
  watched?: ReadonlySet<number>;
  /** Accessible summary, e.g. "Naruto: 220 episodes, 41% filler". */
  label: string;
  size?: 'sm' | 'lg';
  animate?: boolean;
  /** Show first/last episode numbers under the strip (large size only). */
  showAxis?: boolean;
  className?: string;
}

/**
 * The signature element: a whole series drawn as one strip, each classification
 * a coloured band in broadcast order — like a seek bar for the entire show.
 * Watched episodes appear as a thin track underneath.
 */
export const EpisodeStrip = memo(function EpisodeStrip({
  episodes,
  watched,
  label,
  size = 'lg',
  animate = false,
  showAxis = false,
  className,
}: EpisodeStripProps) {
  const runs = useMemo(() => toRuns(episodes), [episodes]);
  const watchedRuns = useMemo(() => {
    if (!watched || watched.size === 0) return [];
    const out: { start: number; end: number }[] = [];
    for (const ep of episodes) {
      if (!watched.has(ep.number)) continue;
      const last = out[out.length - 1];
      if (last && ep.number === last.end + 1) last.end = ep.number;
      else out.push({ start: ep.number, end: ep.number });
    }
    return out;
  }, [episodes, watched]);
  const total = episodes.length || 1;
  const first = episodes[0]?.number ?? 1;

  return (
    <div className={cn('w-full', className)} role="img" aria-label={label}>
      <div
        className={cn(
          'flex w-full gap-px overflow-hidden border-2 border-edge bg-surface',
          size === 'lg' ? 'h-14 rounded-lg sm:h-[4.5rem]' : 'h-3.5 rounded-[6px]',
          animate && 'animate-strip-in',
        )}
      >
        {runs.map((r) => (
          <div
            key={r.start}
            className={cn(TYPE_COLOR_CLASS[r.type], 'min-w-px')}
            style={{ flexGrow: r.end - r.start + 1, flexBasis: 0 }}
            title={`${r.start === r.end ? `Episode ${r.start}` : `Episodes ${r.start}–${r.end}`}: ${TYPE_LABELS[r.type]}`}
          />
        ))}
      </div>
      {watchedRuns.length > 0 && (
        <div className={cn('relative w-full rounded-full bg-track', size === 'lg' ? 'mt-1.5 h-1.5' : 'mt-1 h-1')}>
          {watchedRuns.map((r) => (
            <div
              key={r.start}
              className="absolute inset-y-0 rounded-full bg-foreground"
              style={{ left: `${((r.start - first) / total) * 100}%`, width: `${((r.end - r.start + 1) / total) * 100}%` }}
            />
          ))}
        </div>
      )}
      {showAxis && size === 'lg' && episodes.length > 1 && (
        <div aria-hidden className="tabular mt-2 flex justify-between text-xs text-subtle-foreground">
          <span>Ep {first}</span>
          <span>Ep {episodes[episodes.length - 1].number}</span>
        </div>
      )}
    </div>
  );
});

export function StripLegend({ counts, className }: { counts: EpisodeTypeCounts; className?: string }) {
  const order: EpisodeType[] = ['CANON', 'MIXED', 'ANIME_CANON', 'FILLER'];
  return (
    <dl className={cn('flex flex-wrap gap-x-6 gap-y-2 text-sm', className)}>
      {order
        .filter((t) => counts[t] > 0)
        .map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span aria-hidden className={cn('size-3 rounded-[3px]', TYPE_COLOR_CLASS[t])} />
            <dt className="text-muted-foreground">{TYPE_LABELS[t]}</dt>
            <dd className="tabular font-semibold text-foreground">{counts[t]}</dd>
          </div>
        ))}
    </dl>
  );
}
