import { useMemo } from 'react';
import { ClipboardCopy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ShareButton } from '@/components/ShareButton';
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="watch-order-heading" className="text-2xl font-bold tracking-tight">
            {arc ? `${arc.name} watch order` : 'Canon watch order'}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Watch the green ranges, skip the red ones. {arc ? 'Limited to one arc. ' : ''}
            {arc && (
              <button type="button" onClick={onClearArc} className="font-semibold text-foreground underline underline-offset-4">
                Show the whole series
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const ok = await copyText(watchOrderToText(order, heading, window.location.href));
              toast.show(ok ? 'Watch order copied' : 'Couldn’t copy the watch order', ok ? 'success' : 'error');
            }}
          >
            <ClipboardCopy aria-hidden />
            Copy watch order
          </Button>
          <ShareButton />
        </div>
      </div>

      {(hasMixed || hasAnimeCanon) && (
        <fieldset className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <legend className="sr-only">Episodes to include</legend>
          {hasMixed && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeMixed} onChange={(e) => setIncludeMixed(e.target.checked)} className="size-4 accent-[var(--canon)]" />
              Watch mixed canon/filler episodes
            </label>
          )}
          {hasAnimeCanon && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeAnimeCanon}
                onChange={(e) => setIncludeAnimeCanon(e.target.checked)}
                className="size-4 accent-[var(--canon)]"
              />
              Watch anime-canon episodes
            </label>
          )}
        </fieldset>
      )}

      <EpisodeStrip episodes={stripEpisodes} size="sm" label={`${order.watchCount} episodes to watch and ${order.skipCount} to skip`} />

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="To watch" value={order.watchCount} tone="text-canon" />
        <Stat label="To skip" value={order.skipCount} tone="text-filler" />
        <div className="rounded-xl border border-border bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden /> Time saved
          </dt>
          <dd className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            <span className="tabular">{hoursSaved(order.skipCount)}</span>
            <span className="text-base font-semibold text-muted-foreground"> hours</span>
          </dd>
        </div>
      </dl>

      <div className="grid gap-5 md:grid-cols-2">
        <RangeColumn title="Watch" ranges={order.watch.map(formatRange)} tone="canon" />
        <RangeColumn title="Skip" ranges={order.skip.map(formatRange)} tone="filler" empty="Nothing to skip here." />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-display text-2xl font-bold sm:text-3xl ${tone}`}>
        <span className="tabular">{value}</span>
        <span className="text-base font-semibold text-muted-foreground"> eps</span>
      </dd>
    </div>
  );
}

function RangeColumn({ title, ranges, tone, empty }: { title: string; ranges: string[]; tone: 'canon' | 'filler'; empty?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className={`font-display text-lg font-bold ${tone === 'canon' ? 'text-canon' : 'text-filler'}`}>
        {title} <span className="text-sm font-medium text-muted-foreground">({ranges.length} ranges)</span>
      </h3>
      {ranges.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {ranges.map((r) => (
            <li
              key={r}
              className={`tabular rounded-md px-2.5 py-1 text-sm font-semibold ${tone === 'canon' ? 'bg-canon/12 text-canon' : 'bg-filler/12 text-filler'}`}
            >
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
