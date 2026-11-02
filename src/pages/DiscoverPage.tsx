import { Link } from 'react-router-dom';
import { AnimeCard, AnimeCardSkeleton } from '@/components/AnimeCard';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import { StateMessage, describeError } from '@/components/StateMessage';
import { SectionHeader } from '@/components/ui/section-header';
import { useAnimeByIds, useTopRated } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { displayTitle, type MediaSummary } from '@/services/anilist';
import { findCatalogByAniListId, getCatalog } from '@/services/datasets';
import { groupCatalog, groupStrip, type FranchiseGroup } from '@/utils/franchise';

export default function DiscoverPage() {
  useDocumentTitle('Discover');
  const catalog = getCatalog();
  const groups = groupCatalog(catalog);
  const mostFiller = [...groups].sort((a, b) => b.fillerPercentage - a.fillerPercentage || b.totalEpisodes - a.totalEpisodes).slice(0, 8);
  const leastFiller = [...groups].sort((a, b) => a.fillerPercentage - b.fillerPercentage || b.totalEpisodes - a.totalEpisodes).slice(0, 8);
  const catalogMedia = useAnimeByIds(groups.map((g) => g.first.anilistId));
  const topRated = useTopRated(12);

  return (
    <div className="container-page py-12 sm:py-16">
      <h1 className="text-title">Discover</h1>
      <p className="text-lead mt-3 max-w-prose">
        Filler rankings are calculated from the episode guides on this site. Ratings come from AniList members.
      </p>

      <div className="mt-12 grid gap-4 lg:grid-cols-2 lg:gap-6">
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

      <section aria-labelledby="top-rated-heading" className="mt-20">
        <SectionHeader id="top-rated-heading" title="Highest rated" description="Top TV anime by AniList average score." />
        {topRated.status === 'error' ? (
          <StateMessage className="mt-6" title="Couldn’t load ratings from AniList" onRetry={topRated.retry}>
            {describeError(topRated.error)}
          </StateMessage>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-6">
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
  entries: FranchiseGroup[];
  media: MediaSummary[];
}) {
  return (
    <section aria-labelledby={id} className="surface-card p-5 sm:p-7">
      <h2 id={id} className="text-subheading">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <ol className="mt-6 flex flex-col divide-y divide-border">
        {entries.map((group, i) => {
          const m = media.find((x) => x.id === group.first.anilistId);
          return (
            <li key={group.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <span className="tabular w-6 shrink-0 text-right text-lg font-semibold text-subtle-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to={`/anime/${group.first.slug}`}
                    className="truncate font-semibold tracking-[-0.01em] underline-offset-4 hover:underline"
                  >
                    {group.title}
                  </Link>
                  <span className="tabular shrink-0 text-sm">
                    <span className={`font-semibold ${group.fillerPercentage === 0 ? 'text-canon-text' : 'text-filler-text'}`}>
                      {group.fillerPercentage}%
                    </span>
                    <span className="text-muted-foreground"> filler</span>
                  </span>
                </div>
                <EpisodeStrip episodes={groupStrip(group)} size="sm" label={`${group.title} episode strip`} className="mt-2" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {group.counts.FILLER} of {group.totalEpisodes} episodes are filler
                  {group.entries.length > 1 ? ` across ${group.entries.length} seasons` : ''}
                  {m?.averageScore ? `, rated ${m.averageScore}% on AniList` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {entries.length < 3 && (
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">Rankings grow as more filler guides are imported.</p>
      )}
    </section>
  );
}
