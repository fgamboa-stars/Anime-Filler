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
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{q ? <>Results for “{q}”</> : 'Search anime'}</h1>
      <SearchBox key={q} initialQuery={q} className="mt-6 max-w-2xl" />

      {search.correctedTo && (
        <p className="mt-4 text-sm text-muted-foreground">
          No exact matches, so we searched for <span className="font-semibold text-foreground">{search.correctedTo}</span> instead.
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

          {search.status === 'success' && search.hits.length > 0 && (
            <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
              {search.hits.length} results{withData > 0 ? `, ${withData} with filler data` : ''}
            </p>
          )}

          <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
            <StateMessage title={`No anime match “${q}”`} icon={<SearchX className="size-5 text-muted-foreground" aria-hidden />} className="mt-4">
              Check the spelling or try the Japanese title. You can also{' '}
              <Link to="/discover" className="text-foreground underline underline-offset-4">
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
