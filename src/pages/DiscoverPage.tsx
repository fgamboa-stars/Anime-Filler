import { Link } from 'react-router-dom';
import { AnimeCard, AnimeCardSkeleton } from '@/components/AnimeCard';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import { decodeStrip } from '@/utils/dataset';
import { StateMessage, describeError } from '@/components/StateMessage';
import { useAnimeByIds, useTopRated } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { displayTitle, type MediaSummary } from '@/services/anilist';
import { findCatalogByAniListId, getCatalog } from '@/services/datasets';
import type { CatalogEntry } from '@/types';

export default function DiscoverPage() {
  useDocumentTitle('Discover');
  const catalog = getCatalog();
  const mostFiller = [...catalog].sort((a, b) => b.fillerPercentage - a.fillerPercentage).slice(0, 5);
  const leastFiller = [...catalog].sort((a, b) => a.fillerPercentage - b.fillerPercentage).slice(0, 5);
  const catalogMedia = useAnimeByIds(catalog.map((c) => c.anilistId));
  const topRated = useTopRated(12);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Discover</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Filler rankings are calculated from the episode guides on this site. Ratings come from AniList members.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <FillerRanking
          id="most-filler"
          title="Most filler"
          description="Series where skipping saves the most time."
          entries={mostFiller}
          media={catalogMedia.data ?? []}
        />
        <FillerRanking
          id="least-filler"
          title="Least filler"
          description="Series that stay closest to the source."
          entries={leastFiller}
          media={catalogMedia.data ?? []}
        />
      </div>

      <section aria-labelledby="top-rated-heading" className="mt-16">
        <h2 id="top-rated-heading" className="text-2xl font-bold tracking-tight">
          Highest rated
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Top TV anime by AniList average score.</p>
        {topRated.status === 'error' ? (
          <StateMessage className="mt-6" title="Couldn’t load ratings from AniList" onRetry={topRated.retry}>
            {describeError(topRated.error)}
          </StateMessage>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {topRated.data
              ? topRated.data.map((m) => (
                  <li key={m.id}>
                    <AnimeCard id={m.id} title={displayTitle(m.title)} media={m} catalog={findCatalogByAniListId(m.id) ?? null} />
                  </li>
                ))
              : Array.from({ length: 12 }, (_, i) => (
                  <li key={i}>
                    <AnimeCardSkeleton />
                  </li>
                ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FillerRanking({
  id,
  title,
  description,
  entries,
  media,
}: {
  id: string;
  title: string;
  description: string;
  entries: CatalogEntry[];
  media: MediaSummary[];
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id={id} className="text-xl font-bold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <ol className="mt-5 flex flex-col gap-4">
        {entries.map((entry, i) => {
          const m = media.find((x) => x.id === entry.anilistId);
          return (
            <li key={entry.slug} className="flex items-center gap-4">
              <span className="tabular w-5 text-right font-display text-lg font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link to={`/anime/${entry.slug}`} className="truncate font-semibold hover:underline underline-offset-4">
                    {entry.title}
                  </Link>
                  <span className="tabular shrink-0 text-sm">
                    <span className="font-semibold text-filler">{entry.fillerPercentage}%</span>
                    <span className="text-muted-foreground"> filler</span>
                  </span>
                </div>
                <EpisodeStrip episodes={decodeStrip(entry.strip)} size="sm" label={`${entry.title} episode strip`} className="mt-2" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {entry.counts.FILLER} of {entry.totalEpisodes} episodes are filler
                  {m?.averageScore ? `, rated ${m.averageScore}% on AniList` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {entries.length < 3 && (
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          Rankings grow as more filler guides are imported.
        </p>
      )}
    </section>
  );
}
