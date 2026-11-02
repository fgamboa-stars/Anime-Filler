import { useMemo } from 'react';
import { ClipboardCopy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { cn } from '@/utils/cn';
import { useToast } from '@/components/ui/toast';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import { copyText } from '@/hooks/useClipboard';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { Arc, Episode } from '@/types';
import { formatRange } from '@/utils/dataset';
import { generateWatchOrder, hoursSaved, watchOrderToText } from './generateWatchOrder';

interface WatchOrderPanelProps {
  title: string;
  episodes: Episode[];
  arc: Arc | null;
  onClearArc: () => void;
}

export function WatchOrderPanel({ title, episodes, arc, onClearArc }: WatchOrderPanelProps) {
  const toast = useToast();
  const includeMixed = usePreferencesStore((s) => s.includeMixed);
  const includeAnimeCanon = usePreferencesStore((s) => s.includeAnimeCanon);
  const setIncludeMixed = usePreferencesStore((s) => s.setIncludeMixed);
  const setIncludeAnimeCanon = usePreferencesStore((s) => s.setIncludeAnimeCanon);

  const scoped = useMemo(() => (arc ? episodes.filter((e) => e.arcSlug === arc.slug) : episodes), [episodes, arc]);
  const order = useMemo(() => generateWatchOrder(scoped, { includeMixed, includeAnimeCanon }), [scoped, includeMixed, includeAnimeCanon]);
  const hasMixed = scoped.some((e) => e.type === 'MIXED');
  const hasAnimeCanon = scoped.some((e) => e.type === 'ANIME_CANON');
  const stripEpisodes = useMemo(() => {
    const keep = new Set(order.watchTypes);
    return scoped.map((e) => ({ number: e.number, type: keep.has(e.type) ? ('CANON' as const) : ('FILLER' as const) }));
  }, [scoped, order.watchTypes]);

  const heading = `${title}${arc ? ` (${arc.name})` : ''} — canon watch order`;

  return (
    <section aria-labelledby="watch-order-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="watch-order-heading" className="text-heading">
            {arc ? `${arc.name} watch order` : 'Canon watch order'}
          </h2>
          <p className="mt-1.5 max-w-prose text-muted-foreground">
            Watch the green ranges, skip the red ones. {arc ? 'Limited to one arc. ' : ''}
            {arc && (
              <button
                type="button"
                onClick={onClearArc}
                className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
              >
                Show the whole series
              </button>
            )}
          </p>
        </div>
        <Button
          className="self-start sm:self-auto"
          onClick={async () => {
            const ok = await copyText(watchOrderToText(order, heading, window.location.href));
            toast.show(ok ? 'Watch order copied' : 'Couldn’t copy the watch order', ok ? 'success' : 'error');
          }}
        >
          <ClipboardCopy aria-hidden />
          Copy watch order
        </Button>
      </div>

      <div className="surface-card flex flex-col gap-6 p-5 sm:p-6">
        <dl className="grid grid-cols-3 gap-4 sm:gap-6">
          <Stat
            label="To watch"
            value={
              <>
                {order.watchCount}
                <span className="text-base font-medium text-muted-foreground"> eps</span>
              </>
            }
          />
          <Stat
            label="To skip"
            value={
              <>
                {order.skipCount}
                <span className="text-base font-medium text-muted-foreground"> eps</span>
              </>
            }
          />
          <Stat
            label={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden /> Time saved
              </span>
            }
            value={
              <>
                {hoursSaved(order.skipCount)}
                <span className="text-base font-medium text-muted-foreground"> hours</span>
              </>
            }
          />
        </dl>
        <EpisodeStrip episodes={stripEpisodes} size="sm" label={`${order.watchCount} episodes to watch and ${order.skipCount} to skip`} />
        {(hasMixed || hasAnimeCanon) && (
          <fieldset className="flex flex-col gap-1 border-t border-border pt-4 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <legend className="sr-only">Episodes to include</legend>
            {hasMixed && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={includeMixed}
                  onChange={(e) => setIncludeMixed(e.target.checked)}
                  className="size-[18px] accent-[var(--foreground)]"
                />
                Watch mixed canon/filler episodes
              </label>
            )}
            {hasAnimeCanon && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={includeAnimeCanon}
                  onChange={(e) => setIncludeAnimeCanon(e.target.checked)}
                  className="size-[18px] accent-[var(--foreground)]"
                />
                Watch anime-canon episodes
              </label>
            )}
          </fieldset>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RangeColumn title="Watch" ranges={order.watch.map(formatRange)} tone="canon" />
        <RangeColumn title="Skip" ranges={order.skip.map(formatRange)} tone="filler" empty="Nothing to skip here." />
      </div>
    </section>
  );
}

function RangeColumn({ title, ranges, tone, empty }: { title: string; ranges: string[]; tone: 'canon' | 'filler'; empty?: string }) {
  return (
    <div className="surface-card p-5 sm:p-6">
      <h3 className="flex items-center gap-2.5 text-subheading">
        <span aria-hidden className={cn('size-2.5 rounded-full', tone === 'canon' ? 'bg-canon' : 'bg-filler')} />
        {title} <span className="text-sm font-normal text-muted-foreground">({ranges.length} ranges)</span>
      </h3>
      {ranges.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {ranges.map((r) => (
            <li
              key={r}
              className={cn(
                'tabular rounded-sm border px-2.5 py-1 text-sm font-medium',
                tone === 'canon' ? 'border-canon/25 bg-canon/10 text-canon-text' : 'border-filler/25 bg-filler/10 text-filler-text',
              )}
            >
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
