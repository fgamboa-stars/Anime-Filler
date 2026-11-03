import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ListChecks, ListX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import { Starburst } from '@/components/retro/Starburst';
import { Poster } from '@/components/Poster';
import { SearchBox } from '@/features/search/SearchBox';
import { ContinueWatching } from '@/features/progress/ContinueWatching';
import { useAnimeByIds } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';
import { selectInProgress, useProgressStore } from '@/store/progressStore';
import type { MediaSummary } from '@/services/anilist';
import { groupCatalog, groupStrip, seasonLabel, type FranchiseGroup } from '@/utils/franchise';

/** Season links shown on a guide card before collapsing into "+N more". */
const SEASON_LINKS = 2;
/** Shown first on the home page; everything else follows alphabetically. */
const FEATURED_ORDER = [
  'naruto',
  'naruto-shippuden',
  'one-piece',
  'bleach',
  'dragon-ball-z',
  'My Hero Academia',
  'Attack on Titan',
  'Demon Slayer',
  'Jujutsu Kaisen',
];

export default function HomePage() {
  useDocumentTitle(null);
  const catalog = getCatalog();
  const groups = useMemo(() => {
    const rank = (key: string) => {
      const i = FEATURED_ORDER.indexOf(key);
      return i === -1 ? FEATURED_ORDER.length : i;
    };
    return groupCatalog(catalog).sort((a, b) => rank(a.key) - rank(b.key) || a.title.localeCompare(b.title));
  }, [catalog]);
  const ordered = groups.map((g) => g.first);
  const covers = useAnimeByIds(ordered.map((c) => c.anilistId));
  const hasProgress = useProgressStore((s) => selectInProgress(s.progress).length > 0);
  const lastSlug = useProgressStore((s) => selectInProgress(s.progress)[0]?.slug);
  const featuredSlug = ordered[0]?.slug ?? 'naruto';

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="container-page pt-16 pb-16 sm:pt-28 sm:pb-24">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_13rem]">
            <div>
              <h1 className="text-display max-w-4xl">
                Watch the story.
                <br />
                Skip the filler.
              </h1>
              <p className="text-label mt-6 text-muted-foreground">Search / Filter / Watch order / Track progress</p>
              <p className="text-lead mt-6 max-w-xl">
                Search any anime on AniList. Where filler data exists, every episode is marked canon, mixed or filler — so you can build a
                watch order and pick up where you left off.
              </p>
            </div>
            <div className="relative hidden lg:block">
              <p className="text-label mb-6 text-muted-foreground">
                A free episode guide for anime fans who want the story without the detours.
              </p>
              <dl className="border-2 border-edge bg-primary p-4 text-primary-foreground shadow-hard">
                <div className="flex flex-col-reverse">
                  <dt className="text-label">Series</dt>
                  <dd className="text-kpi">{groups.length}</dd>
                </div>
                <div className="text-label mt-4 flex flex-col-reverse border-t-2 border-primary-foreground/30 pt-3">
                  <dt className="max-w-[7rem]">episodes classified</dt>
                  <dd className="tabular">{catalog.reduce((n, c) => n + c.totalEpisodes, 0).toLocaleString('en-US')}</dd>
                </div>
              </dl>
              <Starburst className="absolute -right-8 -bottom-14 size-28 rotate-[10deg] text-xl">
                No
                <br />
                sign-up
              </Starburst>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-3xl sm:mt-20">
            <p className="text-label mb-3 text-center text-muted-foreground">Search every anime on AniList</p>
            <SearchBox size="lg" />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Button asChild variant="outline" size="sm">
              <Link to={`/anime/${featuredSlug}?type=filler`}>
                <ListX aria-hidden />
                View filler episodes
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/anime/${featuredSlug}?view=watch-order`}>
                <ListChecks aria-hidden />
                Generate watch order
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={lastSlug ? `/anime/${lastSlug}` : '/progress'}>
                <Play aria-hidden />
                Continue watching
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {hasProgress && (
        <section aria-labelledby="continue-heading" className="container-page pb-20">
          <SectionHeader id="continue-heading" title="Continue watching" className="mb-6" />
          <ContinueWatching />
        </section>
      )}

      <section aria-labelledby="featured-heading" className="container-page pb-24">
        <SectionHeader
          id="featured-heading"
          title="Full filler guides"
          className="mb-8"
          description={
            <>
              <span className="tabular">{groups.length}</span> series, <span className="tabular">{catalog.length}</span> seasons,{' '}
              <span className="tabular">{catalog.reduce((n, c) => n + c.totalEpisodes, 0).toLocaleString('en-US')}</span> episodes
              classified.
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
      </section>
    </>
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
