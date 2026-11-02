import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, ListX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
/** Shown first on the home page; everything else follows alphabetically. */
const FEATURED_ORDER = ['naruto', 'naruto-shippuden', 'one-piece', 'bleach', 'dragon-ball-z', 'My Hero Academia', 'Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen'];

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
        <div className="mx-auto max-w-7xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
          <h1 className="max-w-3xl text-[clamp(2.4rem,6vw,4.6rem)] leading-[0.98] font-extrabold tracking-[-0.03em]">
            Watch the story. Skip the filler.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Search any anime on AniList. Where filler data exists, every episode is marked canon, mixed or filler — so you can build a
            watch order and pick up where you left off.
          </p>
          <SearchBox size="lg" className="mt-8 max-w-2xl" />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to={`/anime/${featuredSlug}?type=filler`}>
                <ListX aria-hidden />
                View filler episodes
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/anime/${featuredSlug}?view=watch-order`}>
                <ListChecks aria-hidden />
                Generate watch order
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to={lastSlug ? `/anime/${lastSlug}` : '/progress'}>
                <Play aria-hidden />
                Continue watching
              </Link>
            </Button>
          </div>

          {showcase && (
            <figure className="mt-16">
              <EpisodeStrip
                episodes={showcaseEpisodes}
                label={`${showcase.title}: ${showcase.totalEpisodes} episodes in broadcast order, coloured by classification`}
                animate
              />
              <figcaption className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  <Link to={`/anime/${showcase.slug}`} className="font-semibold text-foreground underline-offset-4 hover:underline">
                    {showcase.title}
                  </Link>
                  , all {showcase.totalEpisodes} episodes in order. Every red band is a run you can skip.
                </p>
                <StripLegend counts={showcase.counts} />
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      {hasProgress && (
        <section aria-labelledby="continue-heading" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
          <h2 id="continue-heading" className="mb-5 text-2xl font-bold tracking-tight">
            Continue watching
          </h2>
          <ContinueWatching />
        </section>
      )}

      <section aria-labelledby="featured-heading" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="featured-heading" className="text-2xl font-bold tracking-tight">
              Full filler guides
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length} series, {catalog.length} seasons, {catalog.reduce((n, c) => n + c.totalEpisodes, 0).toLocaleString('en-US')}{' '}
              episodes classified.
            </p>
          </div>
          <Link to="/discover" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Compare filler rankings
          </Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <li key={group.key}>
              <GuideCard group={group} media={covers.data?.find((m) => m.id === group.first.anilistId) ?? null} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="coverage-heading" className="border-t border-border/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <h2 id="coverage-heading" className="text-2xl font-bold tracking-tight">
            Every anime is searchable. Filler guides are growing.
          </h2>
          <div className="space-y-4 text-muted-foreground">
            <p>
              Titles, ratings, artwork and episode counts come live from AniList, so you can look up anything from Attack on Titan to
              this season’s releases.
            </p>
            <p>
              Episode-by-episode guides cover the long-running shows where skipping matters most. Look for the green “Filler data
              available” badge in search results; everything else shows full details with a note that its guide is coming.
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
    <article className="relative flex h-full gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-ring/50">
      <Poster src={media?.coverImage.large} color={media?.coverImage.color} title={group.title} className="w-20 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-sans text-base leading-snug font-semibold">
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
          <span className={`tabular font-semibold ${group.fillerPercentage === 0 ? 'text-canon' : 'text-filler'}`}>{group.fillerPercentage}%</span>{' '}
          filler
        </p>
        <EpisodeStrip episodes={episodes} size="sm" label={`${group.title} episode strip`} className="mt-auto pt-3" />
        <div className="relative z-10 mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
          {multi ? (
            group.entries.map((e) => (
              <Link key={e.slug} to={`/anime/${e.slug}`} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
                {seasonLabel(e)}
              </Link>
            ))
          ) : (
            <>
              <Link to={`/anime/${first.slug}?view=watch-order`} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
                Watch order
              </Link>
              {first.counts.FILLER > 0 && (
                <Link to={`/anime/${first.slug}?type=filler`} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
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
