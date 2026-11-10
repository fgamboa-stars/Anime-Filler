import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimeCard, AnimeCardSkeleton } from '@/components/AnimeCard';
import { StateMessage, describeError } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Segmented } from '@/components/ui/segmented';
import { GuideCard } from '@/features/discover/GuideCard';
import { NoFillerSection } from '@/features/discover/NoFillerSection';
import { useAnimeByIds, useTopRated } from '@/hooks/useAnimeData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { displayTitle, type MediaSummary } from '@/services/anilist';
import { findCatalogByAniListId, getCatalog } from '@/services/datasets';
import { cn } from '@/utils/cn';
import { featuredGroups, type FranchiseGroup } from '@/utils/franchise';

type Category = 'all' | 'no-filler' | 'top-rated' | 'long' | 'short';

/** Whole series (all seasons) at least this long count as long-running: where filler lives. */
const LONG_RUNNING = 100;
/** Whole series up to this long count as short: two cours. */
const SHORT = 26;
/** Guide cards shown before "Show more". */
const GUIDE_PAGE = 24;

const CATEGORIES: { value: Category; label: string; description: string }[] = [
  { value: 'all', label: 'All guides', description: 'Every series with an episode-by-episode filler guide.' },
  { value: 'no-filler', label: 'No filler', description: '' },
  { value: 'top-rated', label: 'Highest rated', description: 'Top TV anime by AniList average score.' },
  {
    value: 'long',
    label: 'Long-running',
    description: `Series of ${LONG_RUNNING} episodes or more, where a filler guide saves the most time.`,
  },
  { value: 'short', label: 'Short series', description: `Series of ${SHORT} episodes or fewer, all seasons together.` },
];

function readCategory(params: URLSearchParams): Category {
  const cat = params.get('cat');
  if (CATEGORIES.some((c) => c.value === cat)) return cat as Category;
  // Older links: /discover?nofiller=likely
  return params.has('nofiller') ? 'no-filler' : 'all';
}

/** Discover: every filler guide, plus categories (no filler, highest rated, long-running, short). */
export default function DiscoverPage() {
  useDocumentTitle('Discover');
  const catalog = getCatalog();
  const groups = useMemo(() => featuredGroups(catalog), [catalog]);
  const covers = useAnimeByIds(groups.map((g) => g.first.anilistId));
  const media = covers.data ?? [];
  const [params, setParams] = useSearchParams();
  const category = readCategory(params);
  const setCategory = (next: Category) =>
    setParams(
      (p) => {
        const out = new URLSearchParams();
        if (next !== 'all') out.set('cat', next);
        // A genre filter carries over between guide lists.
        if (p.get('genre') && isGuideList(next)) out.set('genre', p.get('genre')!);
        return out;
      },
      { replace: true, preventScrollReset: true },
    );
  const current = CATEGORIES.find((c) => c.value === category)!;

  return (
    <div className="container-page py-12 sm:py-16">
      <h1 className="text-title">Discover</h1>
      <p className="text-lead mt-3 max-w-prose">
        <span className="tabular">{groups.length}</span> series, <span className="tabular">{catalog.length}</span> seasons and{' '}
        <span className="tabular">{catalog.reduce((n, c) => n + c.totalEpisodes, 0).toLocaleString('en-US')}</span> episodes classified.
      </p>

      <Segmented<Category>
        label="Categories"
        className="mt-8"
        value={category}
        onChange={setCategory}
        options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
      />

      {category === 'no-filler' ? (
        <NoFillerSection groups={groups} media={media} className="mt-10" />
      ) : category === 'top-rated' ? (
        <TopRated description={current.description} />
      ) : (
        <GuideList
          key={category}
          title={current.label}
          description={current.description}
          groups={groups.filter((g) =>
            category === 'long' ? g.totalEpisodes >= LONG_RUNNING : category === 'short' ? g.totalEpisodes <= SHORT : true,
          )}
          media={media}
        />
      )}
    </div>
  );
}

const isGuideList = (c: Category) => c === 'all' || c === 'long' || c === 'short';

function GuideList({
  title,
  description,
  groups,
  media,
}: {
  title: string;
  description: string;
  groups: FranchiseGroup[];
  media: MediaSummary[];
}) {
  const [params, setParams] = useSearchParams();
  const genre = params.get('genre');
  const [limit, setLimit] = useState(GUIDE_PAGE);
  const byId = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const mediaFor = (g: FranchiseGroup) => byId.get(g.first.anilistId) ?? null;

  // Genres come from AniList, so the filter appears once AniList has answered.
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    for (const g of groups) for (const name of byId.get(g.first.anilistId)?.genres ?? []) count.set(name, (count.get(name) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [groups, byId]);
  const shown = genre && genres.length ? groups.filter((g) => mediaFor(g)?.genres.includes(genre)) : groups;
  const setGenre = (next: string | null) => {
    setLimit(GUIDE_PAGE);
    setParams(
      (p) => {
        if (next) p.set('genre', next);
        else p.delete('genre');
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  return (
    <section aria-labelledby="guides-heading" className="mt-10">
      <SectionHeader
        id="guides-heading"
        title={title}
        description={
          <>
            {description} <span className="tabular">{shown.length}</span> series{genre && genres.length ? ` in ${genre}` : ''}.
          </>
        }
      />
      {genres.length > 0 && (
        <div role="group" aria-label="Filter by genre" className="mt-6 flex flex-wrap gap-2">
          <GenreChip active={!genre} onClick={() => setGenre(null)}>
            All genres
          </GenreChip>
          {genres.map(([name, n]) => (
            <GenreChip key={name} active={genre === name} onClick={() => setGenre(name)}>
              {name} <span className="tabular ml-1 opacity-60">{n}</span>
            </GenreChip>
          ))}
        </div>
      )}
      {shown.length ? (
        <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.slice(0, limit).map((group) => (
            <li key={group.key}>
              <GuideCard group={group} media={mediaFor(group)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted-foreground">No series in this category{genre ? ` for ${genre}` : ''} yet.</p>
      )}
      {shown.length > limit && (
        <Button variant="outline" className="mt-8" onClick={() => setLimit((n) => n + GUIDE_PAGE * 2)}>
          Show more ({shown.length - limit} left)
        </Button>
      )}
    </section>
  );
}

function GenreChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 border-2 px-3 text-xs font-semibold transition-colors',
        active
          ? 'border-edge bg-primary text-primary-foreground'
          : 'border-border bg-surface text-muted-foreground hover:border-edge hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TopRated({ description }: { description: string }) {
  const topRated = useTopRated(12);
  return (
    <section aria-labelledby="top-rated-heading" className="mt-10">
      <SectionHeader id="top-rated-heading" title="Highest rated" description={description} />
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
  );
}
