import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import { Poster } from '@/components/Poster';
import { useAnimeByIds } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';
import type { MediaSummary } from '@/services/anilist';
import { featuredGroups, groupStrip, seasonLabel, type FranchiseGroup } from '@/utils/franchise';

/** Season links shown on a guide card before collapsing into "+N more". */
const SEASON_LINKS = 2;

/** Every series with a full episode-by-episode filler guide. */
export default function GuidesPage() {
  useDocumentTitle('Filler guides');
  const catalog = getCatalog();
  const groups = useMemo(() => featuredGroups(catalog), [catalog]);
  const covers = useAnimeByIds(groups.map((g) => g.first.anilistId));

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeader
        as="h1"
        title="Filler guides"
        className="mb-10"
        description={
          <>
            <span className="tabular">{groups.length}</span> series, <span className="tabular">{catalog.length}</span> seasons,{' '}
            <span className="tabular">{catalog.reduce((n, c) => n + c.totalEpisodes, 0).toLocaleString('en-US')}</span> episodes classified.
          </>
        }
        action={
          <Button asChild variant="ghost" size="sm" className="-mx-3">
            <Link to="/discover">
              Compare filler rankings
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <li key={group.key}>
            <GuideCard group={group} media={covers.data?.find((m) => m.id === group.first.anilistId) ?? null} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuideCard({ group, media }: { group: FranchiseGroup; media: MediaSummary | null }) {
  const { first } = group;
  const episodes = useMemo(() => groupStrip(group), [group]);
  const multi = group.entries.length > 1;
  return (
    <article className="tile relative flex h-full gap-4 p-4 sm:p-5">
      <Poster src={media?.coverImage.large} color={media?.coverImage.color} title={group.title} className="w-20 shrink-0 self-start " />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base leading-snug font-semibold tracking-[-0.01em]">
          <Link to={`/anime/${first.slug}`} className="outline-none after:absolute after:inset-0 focus-visible:underline">
            {group.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {multi && (
            <>
              <span className="tabular">{group.entries.length}</span> seasons,{' '}
            </>
          )}
          <span className="tabular">{group.totalEpisodes}</span> episodes,{' '}
          <span className={`tabular font-semibold ${group.fillerPercentage === 0 ? 'text-canon-text' : 'text-filler-text'}`}>
            {group.fillerPercentage}%
          </span>{' '}
          filler
        </p>
        <EpisodeStrip episodes={episodes} size="sm" label={`${group.title} episode strip`} className="mt-auto pt-4" />
        <div className="relative z-10 mt-2 -mb-1 -ml-2 flex flex-wrap text-sm font-medium">
          {multi ? (
            <>
              {group.entries.slice(0, SEASON_LINKS).map((e) => (
                <Link key={e.slug} to={`/anime/${e.slug}`} className="link-pill max-w-[11rem] text-muted-foreground">
                  <span className="truncate">{seasonLabel(e)}</span>
                </Link>
              ))}
              {group.entries.length > SEASON_LINKS && (
                <Link
                  to={`/anime/${group.entries[SEASON_LINKS].slug}`}
                  className="link-pill text-subtle-foreground"
                  aria-label={`${group.entries.length - SEASON_LINKS} more ${group.title} seasons`}
                >
                  +{group.entries.length - SEASON_LINKS} more
                </Link>
              )}
            </>
          ) : (
            <>
              <Link to={`/anime/${first.slug}?view=watch-order`} className="link-pill text-muted-foreground">
                Watch order
              </Link>
              {first.counts.FILLER > 0 && (
                <Link to={`/anime/${first.slug}?type=filler`} className="link-pill text-muted-foreground">
                  Filler only
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
