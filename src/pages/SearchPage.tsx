import { Link, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { AnimeCard, AnimeCardSkeleton } from '@/components/AnimeCard';
import { StateMessage, describeError } from '@/components/StateMessage';
import { SearchBox } from '@/features/search/SearchBox';
import { useAnimeSearch } from '@/features/search/useAnimeSearch';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const search = useAnimeSearch(q, { delay: 0, perPage: 24 });
  useDocumentTitle(q ? `Search: ${q}` : 'Search');
  const withData = search.hits.filter((h) => h.item.catalog).length;

  return (
    <div className="container-page py-12 sm:py-16">
      <h1 className="text-title text-balance">{q ? <>Results for “{q}”</> : 'Search anime'}</h1>
      <SearchBox key={q} initialQuery={q} className="mt-8 max-w-2xl" />

      {search.correctedTo && (
        <p className="mt-4 text-sm text-muted-foreground">
          No exact matches, so we searched for <span className="font-medium text-foreground">{search.correctedTo}</span> instead.
        </p>
      )}

      {q.trim().length < 2 ? (
        <p className="mt-10 text-muted-foreground">Type at least two characters to search every anime on AniList.</p>
      ) : (
        <>
          {search.error && (
            <StateMessage className="mt-8" title="AniList search is unavailable" onRetry={search.retry}>
              {describeError(search.error)} {search.hits.length > 0 && 'Showing matches from the local filler guides meanwhile.'}
            </StateMessage>
          )}

          {/* Always rendered so the grid doesn't jump down when the count arrives. */}
          <p className="mt-6 min-h-6 text-sm text-muted-foreground" aria-live="polite">
            {search.status === 'success' && search.hits.length > 0
              ? `${search.hits.length} results${withData > 0 ? `, ${withData} with filler data` : ''}`
              : null}
          </p>

          <h2 className="sr-only">Results</h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-6">
            {search.status === 'loading' && search.hits.length === 0
              ? Array.from({ length: 12 }, (_, i) => (
                  <li key={i}>
                    <AnimeCardSkeleton />
                  </li>
                ))
              : search.hits.map((hit, i) => (
                  <li key={hit.item.id}>
                    <AnimeCard
                      id={hit.item.id}
                      title={hit.item.title}
                      media={hit.item.media}
                      catalog={hit.item.catalog}
                      highlights={hit.highlights}
                      priority={i < 6}
                    />
                  </li>
                ))}
          </ul>

          {search.status === 'success' && search.hits.length === 0 && (
            <StateMessage title={`No anime match “${q}”`} icon={<SearchX className="text-muted-foreground" />} className="mt-4">
              Check the spelling or try the Japanese title. You can also{' '}
              <Link
                to="/discover"
                className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
              >
                browse highly rated anime
              </Link>
              .
            </StateMessage>
          )}
        </>
      )}
    </div>
  );
}
