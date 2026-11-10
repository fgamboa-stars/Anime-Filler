import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShareBar } from '@/components/ui/share-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { Window, useWindowState } from '@/components/retro/Window';
import { isAnimeOriginal, rankLeastFiller, rankMostFiller } from '@/features/discover/rankings';
import type { MediaSummary } from '@/services/anilist';
import { cn } from '@/utils/cn';
import type { FranchiseGroup } from '@/utils/franchise';

/** Entries shown normally, and when a ranking window is maximized. */
const SHOWN = 8;
const SHOWN_MAXIMIZED = 20;

/** "Most filler" and "Least filler" windows, built from this site's episode guides. */
export function FillerRankings({ groups, media, className }: { groups: FranchiseGroup[]; media: MediaSummary[]; className?: string }) {
  const animeOriginal = groups.filter((g) => isAnimeOriginal(g.counts));
  return (
    <section aria-labelledby="rankings-heading" className={className}>
      <SectionHeader
        id="rankings-heading"
        title="Filler rankings"
        description="Calculated from the episode guides on this site. Ratings come from AniList members."
      />
      <div className="mt-8 grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <FillerRanking
          id="most-filler"
          title="Most filler"
          description="Series where skipping saves the most time."
          entries={rankMostFiller(groups, SHOWN_MAXIMIZED)}
          media={media}
          note={
            animeOriginal.length > 0 && (
              <>
                Left out: {animeOriginal.length} anime-original series (such as{' '}
                {animeOriginal
                  .slice(0, 2)
                  .map((g) => g.title)
                  .join(' and ')}
                ), where every episode is marked filler because the anime tells its own story.
              </>
            )
          }
        />
        <FillerRanking
          id="least-filler"
          title="Least filler"
          description="Series with some filler that stay closest to the source."
          entries={rankLeastFiller(groups, SHOWN_MAXIMIZED)}
          media={media}
          note={
            <>
              Series with no filler at all are listed under{' '}
              <Link to="/discover?cat=no-filler" className="underline underline-offset-2 hover:text-foreground">
                No filler
              </Link>{' '}
              on Discover.
            </>
          }
        />
      </div>
    </section>
  );
}

function FillerRanking({
  id,
  title,
  description,
  entries,
  media,
  note,
}: {
  id: string;
  title: string;
  description: string;
  entries: FranchiseGroup[];
  media: MediaSummary[];
  note?: ReactNode;
}) {
  const [state, setState] = useWindowState(id);
  const shown = state === 'maximized' ? entries : entries.slice(0, SHOWN);
  return (
    <Window
      as="section"
      aria-labelledby={id}
      title={`${id}.txt`}
      bodyClassName="p-5 sm:p-7"
      className={cn(state === 'maximized' && 'lg:col-span-2')}
      controls={{ state, onChange: setState, name: title }}
    >
      <h2 id={id} className="text-subheading">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {description}
        {state === 'maximized' && ` Top ${shown.length}.`}
      </p>
      <ol className={cn('mt-6 grid divide-y divide-border', state === 'maximized' && 'lg:grid-flow-col lg:grid-rows-10 lg:gap-x-10')}>
        {shown.map((group, i) => {
          const m = media.find((x) => x.id === group.first.anilistId);
          return (
            <li key={group.key} className="flex items-center gap-4 py-4">
              <span className="tabular w-7 shrink-0 text-right font-[family-name:var(--font-display)] text-2xl text-subtle-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to={`/anime/${group.first.slug}`}
                    className="truncate font-bold tracking-[-0.015em] underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-foreground"
                  >
                    {group.title}
                  </Link>
                  <span className="tabular shrink-0 text-sm">
                    <span className={`text-lg font-bold ${group.fillerPercentage === 0 ? 'text-canon-text' : 'text-filler-text'}`}>
                      {group.fillerPercentage}%
                    </span>
                    <span className="text-muted-foreground"> filler</span>
                  </span>
                </div>
                <ShareBar framed value={group.fillerPercentage} barClassName="bg-filler" className="mt-2" />
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
      {note && <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{note}</p>}
    </Window>
  );
}
