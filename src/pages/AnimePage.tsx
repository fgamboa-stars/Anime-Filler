import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Database, Info } from 'lucide-react';
import { EpisodeStrip, StripLegend } from '@/components/EpisodeStrip';
import { ShareButton } from '@/components/ShareButton';
import { StateMessage, describeError } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimeHero } from '@/features/anime/AnimeHero';
import { ArcList } from '@/features/arcs/ArcList';
import { EpisodeFilters } from '@/features/episodes/EpisodeFilters';
import { EpisodeList } from '@/features/episodes/EpisodeList';
import { filterEpisodes, type AnimeView } from '@/features/episodes/filterEpisodes';
import { useEpisodeFilters } from '@/features/episodes/useEpisodeFilters';
import { ProgressSummary } from '@/features/progress/ProgressSummary';
import { WatchOrderPanel } from '@/features/watch-order/WatchOrderPanel';
import { useAnimeDetail, useDataset } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AniListError, displayTitle } from '@/services/anilist';
import { findCatalogByAniListId, findCatalogBySlug } from '@/services/datasets';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useProgressStore } from '@/store/progressStore';
import type { CatalogEntry, PreparedDataset } from '@/types';
import { cn } from '@/utils/cn';
import NotFoundPage from './NotFoundPage';

export default function AnimePage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const entry = findCatalogBySlug(id) ?? null;
  const numericId = !entry && /^\d+(-|$)/.test(id) ? Number.parseInt(id, 10) : null;
  const redirectTo = numericId ? findCatalogByAniListId(numericId) : undefined;
  const anilistId = entry?.anilistId ?? numericId;

  const detail = useAnimeDetail(redirectTo ? null : anilistId);
  const dataset = useDataset(redirectTo ? null : (entry?.slug ?? null));
  const media = detail.data ?? null;
  useDocumentTitle(media ? displayTitle(media.title) : (entry?.title ?? null));

  if (redirectTo) return <Navigate replace to={`/anime/${redirectTo.slug}${location.search}${location.hash}`} />;
  if (!anilistId) return <NotFoundPage />;

  const notFound = detail.status === 'error' && detail.error instanceof AniListError && detail.error.kind === 'not-found';
  if (notFound && !entry) return <NotFoundPage message="AniList has no anime with this ID. It may have been removed or merged." />;

  return (
    <div className="pb-16">
      <AnimeHero media={media} catalog={entry} loading={detail.status === 'loading'}>
        {detail.status === 'error' && !notFound && (
          <StateMessage
            className="mt-6"
            title={entry ? 'Showing filler data without AniList details' : 'Couldn’t load this anime'}
            onRetry={detail.retry}
          >
            {describeError(detail.error)}
          </StateMessage>
        )}
      </AnimeHero>

      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        {entry ? (
          dataset.status === 'error' ? (
            <StateMessage title="Couldn’t load the episode guide" onRetry={dataset.retry}>
              {describeError(dataset.error)}
            </StateMessage>
          ) : dataset.data ? (
            <FillerGuide dataset={dataset.data} entry={entry} />
          ) : (
            <GuideSkeleton />
          )
        ) : (
          detail.status !== 'error' && <NoFillerData />
        )}
      </div>
    </div>
  );
}

function NoFillerData() {
  return (
    <section aria-labelledby="no-filler-heading" className="rounded-2xl border border-mixed/35 bg-mixed/[0.06] p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-5 shrink-0 text-mixed" aria-hidden />
        <div className="space-y-2">
          <h2 id="no-filler-heading" className="font-sans text-lg font-semibold">
            Filler data is not currently available for this anime.
          </h2>
          <p className="text-muted-foreground">Anime information is provided by AniList.</p>
          <p className="text-muted-foreground">Additional filler datasets may be added in future updates.</p>
          <div className="flex flex-wrap gap-2 pt-3">
            <Button asChild size="sm" variant="secondary">
              <Link to="/discover">Browse anime with filler guides</Link>
            </Button>
            <ShareButton variant="ghost" />
          </div>
        </div>
      </div>
    </section>
  );
}

function GuideSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading episode guide">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

const TABS: { view: AnimeView; label: string }[] = [
  { view: 'episodes', label: 'Episodes' },
  { view: 'watch-order', label: 'Watch order' },
  { view: 'arcs', label: 'Arcs' },
];

function FillerGuide({ dataset, entry }: { dataset: PreparedDataset; entry: CatalogEntry }) {
  const { filters, view, setFilters, setView, resetFilters } = useEpisodeFilters(dataset.slug);
  const location = useLocation();
  const navigate = useNavigate();
  const watchedList = useProgressStore((s) => s.progress[dataset.slug]?.watched);
  const toggleEpisode = useProgressStore((s) => s.toggleEpisode);
  const markUpTo = useProgressStore((s) => s.markUpTo);
  const setEpisodes = useProgressStore((s) => s.setEpisodes);
  const hideTitles = usePreferencesStore((s) => s.hideEpisodeTitles);

  const watched = useMemo(() => new Set(watchedList ?? []), [watchedList]);
  const meta = useMemo(() => ({ title: dataset.title, totalEpisodes: dataset.episodes.length }), [dataset]);
  const visible = useMemo(() => filterEpisodes(dataset.episodes, filters, watched), [dataset.episodes, filters, watched]);
  const arc = filters.arc ? (dataset.arcs.find((a) => a.slug === filters.arc) ?? null) : null;
  const focusEpisode = Number(/^#ep-(\d+)$/.exec(location.hash)?.[1] ?? 0) || null;

  const onToggle = useCallback((n: number) => toggleEpisode(dataset.slug, n, meta), [toggleEpisode, dataset.slug, meta]);
  const onMarkUpTo = useCallback((n: number) => markUpTo(dataset.slug, n, meta), [markUpTo, dataset.slug, meta]);
  const onArcClick = useCallback((slug: string) => setFilters({ arc: slug }), [setFilters]);
  const jumpTo = useCallback((n: number) => navigate({ pathname: location.pathname, search: '', hash: `ep-${n}` }), [navigate, location.pathname]);

  // Scroll to #ep-N once it is rendered (deep links and "Continue" buttons).
  useEffect(() => {
    if (!focusEpisode || view !== 'episodes') return;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`ep-${focusEpisode}`);
      row?.scrollIntoView({ block: 'center' });
      row?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusEpisode, view, visible.length]);

  const allVisibleWatched = visible.length > 0 && visible.every((e) => watched.has(e.number));

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Series overview" className="flex flex-col gap-4">
        <EpisodeStrip
          episodes={dataset.episodes}
          watched={watched}
          label={`${dataset.title}: ${dataset.counts.CANON} canon, ${dataset.counts.MIXED} mixed, ${dataset.counts.ANIME_CANON} anime canon and ${dataset.counts.FILLER} filler episodes`}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StripLegend counts={dataset.counts} />
          <p className="text-sm text-muted-foreground">
            <span className="tabular font-semibold text-filler">{entry.fillerPercentage}%</span> filler
          </p>
        </div>
        <ProgressSummary dataset={dataset} onJump={jumpTo} />
      </section>

      <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <nav aria-label="Episode guide sections" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              aria-current={view === t.view ? 'page' : undefined}
              onClick={() => setView(t.view)}
              className={cn(
                'shrink-0 border-b-2 px-4 pt-2 pb-3 text-sm font-semibold transition-colors',
                view === t.view ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="pb-3">
          <ShareButton variant="ghost" />
        </div>
      </div>

      {view === 'episodes' && (
        <section aria-labelledby="episodes-heading" className="flex flex-col gap-5">
          <h2 id="episodes-heading" className="sr-only">
            Episodes
          </h2>
          <EpisodeFilters filters={filters} arcs={dataset.arcs} counts={dataset.counts} onChange={setFilters} onReset={resetFilters} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Showing <span className="tabular font-semibold text-foreground">{visible.length}</span> of{' '}
              <span className="tabular">{dataset.episodes.length}</span> episodes
              {arc ? ` in ${arc.name}` : ''}
            </p>
            {visible.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEpisodes(
                    dataset.slug,
                    visible.map((e) => e.number),
                    !allVisibleWatched,
                    meta,
                  )
                }
              >
                {allVisibleWatched ? 'Unmark shown episodes' : 'Mark shown as watched'}
              </Button>
            )}
          </div>
          {visible.length ? (
            <EpisodeList
              episodes={visible}
              watched={watched}
              hideTitles={hideTitles}
              onToggle={onToggle}
              onMarkUpTo={onMarkUpTo}
              onArcClick={onArcClick}
              focusEpisode={focusEpisode}
            />
          ) : (
            <StateMessage
              title="No episodes match these filters"
              icon={<Database className="size-5 text-muted-foreground" aria-hidden />}
              action={
                <Button size="sm" variant="secondary" onClick={resetFilters}>
                  Reset filters
                </Button>
              }
            >
              Try another episode type or arc.
            </StateMessage>
          )}
        </section>
      )}

      {view === 'watch-order' && (
        <WatchOrderPanel title={dataset.title} episodes={dataset.episodes} arc={arc} onClearArc={() => setFilters({ arc: null })} />
      )}

      {view === 'arcs' && <ArcList arcs={dataset.arcs} episodes={dataset.episodes} watched={watched} />}

      {dataset.source && <p className="text-xs text-muted-foreground">{dataset.source}.</p>}
    </div>
  );
}
