import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ListChecks, ListX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { EpisodeStrip, StripLegend } from '@/components/EpisodeStrip';
import { Poster } from '@/components/Poster';
import { SearchBox } from '@/features/search/SearchBox';
import { ContinueWatching } from '@/features/progress/ContinueWatching';
import { useAnimeByIds } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';
import { selectInProgress, useProgressStore } from '@/store/progressStore';
import type { MediaSummary } from '@/services/anilist';
import { decodeStrip } from '@/utils/dataset';
import { groupCatalog, groupStrip, seasonLabel, type FranchiseGroup } from '@/utils/franchise';

const SHOWCASE_SLUG = 'naruto-shippuden';
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
  const showcase = catalog.find((c) => c.slug === SHOWCASE_SLUG) ?? ordered[0];
  const showcaseEpisodes = useMemo(() => (showcase ? decodeStrip(showcase.strip) : []), [showcase]);
  const hasProgress = useProgressStore((s) => selectInProgress(s.progress).length > 0);
  const lastSlug = useProgressStore((s) => selectInProgress(s.progress)[0]?.slug);
  const featuredSlug = ordered[0]?.slug ?? 'naruto';

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="container-page pt-16 pb-16 sm:pt-28 sm:pb-24">
          <h1 className="text-display max-w-4xl text-balance">Watch the story. Skip the filler.</h1>
          <p className="text-lead mt-6 max-w-xl">
            Search any anime on AniList. Where filler data exists, every episode is marked canon, mixed or filler — so you can build a watch
            order and pick up where you left off.
          </p>
          <SearchBox size="lg" className="mt-10 max-w-2xl" />
          <div className="mt-5 flex flex-wrap gap-2">
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

          {showcase && (
            <figure className="surface-card mt-16 p-5 shadow-lg sm:mt-24 sm:p-8">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    to={`/anime/${showcase.slug}`}
                    className="text-heading underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {showcase.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    All {showcase.totalEpisodes} episodes in order. Every red band is a run you can skip.
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span className="tabular block text-3xl font-semibold tracking-tight text-filler-text sm:text-5xl">
                    {showcase.fillerPercentage}%
                  </span>
                  <span className="text-sm text-muted-foreground">filler</span>
                </p>
              </div>
              <EpisodeStrip
                episodes={showcaseEpisodes}
                label={`${showcase.title}: ${showcase.totalEpisodes} episodes in broadcast order, coloured by classification`}
                animate
                showAxis
              />
              <figcaption className="mt-5 border-t border-border pt-5">
                <span className="sr-only">Episode counts by type</span>
                <StripLegend counts={showcase.counts} />
              </figcaption>
            </figure>
          )}
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

      <section aria-labelledby="coverage-heading" className="border-t border-border">
        <div className="container-page grid gap-6 py-20 md:grid-cols-[1fr_1.3fr] md:gap-16">
          <h2 id="coverage-heading" className="text-title text-balance">
            Every anime is searchable. Filler guides are growing.
          </h2>
          <div className="text-lead space-y-4">
            <p>
              Titles, ratings, artwork and episode counts come live from AniList, so you can look up anything from Attack on Titan to this
              season’s releases.
            </p>
            <p>
              Episode-by-episode guides cover the long-running shows where skipping matters most. Look for the green “Filler data available”
              badge in search results; everything else shows full details with a note that its guide is coming.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function GuideCard({ group, media }: { group: FranchiseGroup; media: MediaSummary | null }) {
  const { first } = group;
  const episodes = useMemo(() => groupStrip(group), [group]);
  const multi = group.entries.length > 1;
  return (
    <article className="surface-card relative flex h-full gap-4 p-4 transition-[box-shadow,border-color] duration-200 hover:border-border-strong/60 hover:shadow-md sm:p-5">
      <Poster
        src={media?.coverImage.large}
        color={media?.coverImage.color}
        title={group.title}
        className="w-20 shrink-0 self-start rounded-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base leading-snug font-semibold tracking-[-0.01em]">
          <Link to={`/anime/${first.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:underline">
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
                <Link
                  key={e.slug}
                  to={`/anime/${e.slug}`}
                  className="inline-flex h-9 max-w-[11rem] items-center rounded-full px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <span className="truncate">{seasonLabel(e)}</span>
                </Link>
              ))}
              {group.entries.length > SEASON_LINKS && (
                <Link
                  to={`/anime/${group.entries[SEASON_LINKS].slug}`}
                  className="inline-flex h-9 items-center rounded-full px-2 text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
                  aria-label={`${group.entries.length - SEASON_LINKS} more ${group.title} seasons`}
                >
                  +{group.entries.length - SEASON_LINKS} more
                </Link>
              )}
            </>
          ) : (
            <>
              <Link
                to={`/anime/${first.slug}?view=watch-order`}
                className="inline-flex h-9 items-center rounded-full px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Watch order
              </Link>
              {first.counts.FILLER > 0 && (
                <Link
                  to={`/anime/${first.slug}?type=filler`}
                  className="inline-flex h-9 items-center rounded-full px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
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
