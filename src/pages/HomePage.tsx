import { Link } from 'react-router-dom';
import { Clapperboard, ListChecks, ListX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EpisodeStrip, StripLegend } from '@/components/EpisodeStrip';
import { Poster } from '@/components/Poster';
import { SearchBox } from '@/features/search/SearchBox';
import { ContinueWatching } from '@/features/progress/ContinueWatching';
import { useAnimeByIds, useDataset } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';
import { selectInProgress, useProgressStore } from '@/store/progressStore';
import type { CatalogEntry } from '@/types';
import type { MediaSummary } from '@/services/anilist';

const SHOWCASE_SLUG = 'naruto-shippuden';

export default function HomePage() {
  useDocumentTitle(null);
  const catalog = getCatalog();
  const covers = useAnimeByIds(catalog.map((c) => c.anilistId));
  const showcase = useDataset(catalog.some((c) => c.slug === SHOWCASE_SLUG) ? SHOWCASE_SLUG : (catalog[0]?.slug ?? null));
  const hasProgress = useProgressStore((s) => selectInProgress(s.progress).length > 0);
  const lastSlug = useProgressStore((s) => selectInProgress(s.progress)[0]?.slug);
  const featuredSlug = catalog[0]?.slug ?? 'naruto';

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

          {!showcase.data && (
            <div aria-hidden className="mt-16">
              <div className="h-10 rounded-[3px] bg-muted sm:h-12" />
              <div className="mt-4 h-5" />
            </div>
          )}
          {showcase.data && (
            <figure className="mt-16">
              <EpisodeStrip
                episodes={showcase.data.episodes}
                label={`${showcase.data.title}: ${showcase.data.totalEpisodes} episodes in broadcast order, coloured by classification`}
                animate
              />
              <figcaption className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  <Link to={`/anime/${showcase.data.slug}`} className="font-semibold text-foreground underline-offset-4 hover:underline">
                    {showcase.data.title}
                  </Link>
                  , all {showcase.data.totalEpisodes} episodes in order. Every red band is a run you can skip.
                </p>
                <StripLegend counts={showcase.data.counts} />
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
          <h2 id="featured-heading" className="text-2xl font-bold tracking-tight">
            Full filler guides
          </h2>
          <Link to="/discover" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Discover more anime
          </Link>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {catalog.map((entry) => (
            <FeaturedCard key={entry.slug} entry={entry} media={covers.data?.find((m) => m.id === entry.anilistId) ?? null} />
          ))}
        </div>
      </section>

      <section aria-labelledby="coverage-heading" className="border-t border-border/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <h2 id="coverage-heading" className="text-2xl font-bold tracking-tight">
            Every anime is searchable. Filler guides are growing.
          </h2>
          <div className="space-y-4 text-muted-foreground">
            <p>
              Titles, ratings, artwork and episode counts come live from AniList, so you can look up anything from Attack on Titan to
              this season’s releases. Episode-by-episode filler guides currently cover{' '}
              {catalog.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 && (i === catalog.length - 1 ? ' and ' : ', ')}
                  <Link to={`/anime/${c.slug}`} className="text-foreground underline underline-offset-4">
                    {c.title}
                  </Link>
                </span>
              ))}
              .
            </p>
            <p>
              Series like Bleach, One Piece and Dragon Ball are next. Each new guide is a data import — look for the green “Filler data
              available” badge in search results.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function FeaturedCard({ entry, media }: { entry: CatalogEntry; media: MediaSummary | null }) {
  const dataset = useDataset(entry.slug);
  const watched = useProgressStore((s) => s.progress[entry.slug]?.watched);
  const watchedSet = new Set(watched ?? []);
  return (
    <article className="flex gap-5 rounded-2xl border border-border bg-card p-5">
      <Poster src={media?.coverImage.large} color={media?.coverImage.color} title={entry.title} className="w-24 shrink-0 sm:w-28" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-xl font-bold tracking-tight">
          <Link to={`/anime/${entry.slug}`} className="hover:underline underline-offset-4">
            {entry.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="tabular">{entry.totalEpisodes}</span> episodes, <span className="tabular font-semibold text-filler">{entry.fillerPercentage}%</span>{' '}
          filler, <span className="tabular">{entry.arcCount}</span> arcs
        </p>
        <div className="mt-4">
          {dataset.data ? (
            <EpisodeStrip episodes={dataset.data.episodes} watched={watchedSet} size="sm" label={`${entry.title} episode strip`} />
          ) : (
            <div className="h-3 animate-shimmer rounded bg-muted" />
          )}
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Button asChild size="sm">
            <Link to={`/anime/${entry.slug}`}>
              <Clapperboard aria-hidden />
              Episodes
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to={`/anime/${entry.slug}?view=watch-order`}>Watch order</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/anime/${entry.slug}?type=filler`}>Filler only</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
