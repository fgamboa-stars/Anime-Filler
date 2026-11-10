import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, ListX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Starburst } from '@/components/retro/Starburst';
import { SearchBox } from '@/features/search/SearchBox';
import { ContinueWatching } from '@/features/progress/ContinueWatching';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';
import { selectInProgress, useProgressStore } from '@/store/progressStore';
import { featuredGroups } from '@/utils/franchise';

export default function HomePage() {
  useDocumentTitle(null);
  const catalog = getCatalog();
  const groups = useMemo(() => featuredGroups(catalog), [catalog]);
  const hasProgress = useProgressStore((s) => selectInProgress(s.progress).length > 0);
  const lastSlug = useProgressStore((s) => selectInProgress(s.progress)[0]?.slug);
  const featuredSlug = groups[0]?.first.slug ?? 'naruto';

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="container-page pt-10 pb-16 sm:pt-14 sm:pb-24">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_13rem]">
            <div>
              {/* Smaller than the usual display size so the search box sits near the top of the page. */}
              <h1 className="text-display max-w-4xl !text-[clamp(2.25rem,6vw,4.5rem)]">
                Watch the story.
                <br />
                Skip the filler.
              </h1>
              <div className="mt-8 max-w-3xl sm:mt-10">
                <p className="text-label mb-3 text-muted-foreground">Search every anime on AniList</p>
                <SearchBox size="lg" />
              </div>
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
          <div className="mt-6 flex flex-wrap gap-2.5">
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
    </>
  );
}
