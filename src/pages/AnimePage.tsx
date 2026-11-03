import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Database } from 'lucide-react';
import { EpisodeDonut } from '@/components/EpisodeDonut';
import { ShareButton } from '@/components/ShareButton';
import { StateMessage, describeError } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
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
import { AniListError, airedEpisodes, displayTitle } from '@/services/anilist';
import { findCatalogByAniListId, findCatalogBySlug, getCatalog } from '@/services/datasets';
import { franchiseSiblings, seasonLabel } from '@/utils/franchise';
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

      <div className="container-page mt-10">
        {entry && <SeasonNav entry={entry} />}
        {entry ? (
          dataset.status === 'error' ? (
            <StateMessage title="Couldn’t load the episode guide" onRetry={dataset.retry}>
              {describeError(dataset.error)}
            </StateMessage>
          ) : dataset.data ? (
            <FillerGuide dataset={dataset.data} aired={airedEpisodes(media)} />
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

function SeasonNav({ entry }: { entry: CatalogEntry }) {
  const siblings = franchiseSiblings(getCatalog(), entry);
  if (siblings.length < 2) return null;
  return (
    <nav aria-label={`${entry.franchise} seasons`} className="mb-10">
      <p className="mb-3 text-caption text-muted-foreground">
        {entry.franchise}: {siblings.length} seasons
      </p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {siblings.map((s) => {
          const current = s.slug === entry.slug;
          return (
            <li key={s.slug} className="shrink-0">
              <Link
                to={`/anime/${s.slug}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                  current ? 'border-foreground bg-foreground text-background' : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                {seasonLabel(s)}
                <span className={cn('tabular text-xs', current ? 'text-background/70' : 'text-subtle-foreground')}>
                  {s.totalEpisodes} eps
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NoFillerData() {
  return (
    <section aria-labelledby="no-filler-heading">
      <Notice
        tone="warning"
        titleAs="h2"
        titleId="no-filler-heading"
        title="Filler data is not currently available for this anime."
        className="p-5 sm:p-6 [&_h2]:text-subheading"
        actions={
          <>
            <Button asChild size="sm">
              <Link to="/discover">Browse anime with filler guides</Link>
            </Button>
            <ShareButton variant="outline" />
          </>
        }
      >
        <p>Anime information is provided by AniList.</p>
        <p>Additional filler datasets may be added in future updates.</p>
      </Notice>
    </section>
  );
}

function GuideSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading episode guide">
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
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

function FillerGuide({ dataset, aired }: { dataset: PreparedDataset; aired: number | null }) {
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
  const jumpTo = useCallback(
    (n: number) => navigate({ pathname: location.pathname, search: '', hash: `ep-${n}` }),
    [navigate, location.pathname],
  );

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
  const lastClassified = dataset.episodes[dataset.episodes.length - 1]?.number ?? 0;
  const unclassified = aired && aired > lastClassified ? aired - lastClassified : 0;

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Series overview" className="flex flex-col gap-4">
        <div className="surface-card p-5 sm:p-8">
          <div className="mb-8">
            <h2 className="text-heading text-balance">
              <span className="tabular text-filler-text">{dataset.counts.FILLER}</span> of{' '}
              <span className="tabular">{dataset.episodes.length}</span> episodes are filler
            </h2>
            <p className="mt-1.5 text-muted-foreground">How the series splits by episode type.</p>
          </div>
          <EpisodeDonut
            counts={dataset.counts}
            label={`${dataset.title}: ${dataset.counts.CANON} canon, ${dataset.counts.MIXED} mixed, ${dataset.counts.ANIME_CANON} anime canon and ${dataset.counts.FILLER} filler episodes`}
          />
        </div>
        {unclassified > 0 && (
          <Notice tone="info">
            <p className="text-foreground">
              This guide covers episodes 1–{lastClassified}. AniList lists {aired} aired episodes, so the newest{' '}
              {unclassified === 1 ? 'episode isn’t' : `${unclassified} aren’t`} classified yet.
            </p>
          </Notice>
        )}
        <ProgressSummary dataset={dataset} onJump={jumpTo} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Episode guide sections"
          options={TABS.map((t) => ({ value: t.view, label: t.label }))}
          value={view}
          onChange={setView}
        />
        <ShareButton variant="ghost" />
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
              icon={<Database className="text-muted-foreground" />}
              action={
                <Button size="sm" variant="outline" onClick={resetFilters}>
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

      {dataset.source && <p className="text-xs text-subtle-foreground">{dataset.source}.</p>}
    </div>
  );
}
