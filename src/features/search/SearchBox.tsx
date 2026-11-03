import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { Highlight } from '@/components/Highlight';
import { animePath } from '@/services/datasets';
import { formatFormat } from '@/services/anilist';
import { cn } from '@/utils/cn';
import { useAnimeSearch } from './useAnimeSearch';

interface SearchBoxProps {
  size?: 'default' | 'lg';
  autoFocus?: boolean;
  initialQuery?: string;
  className?: string;
  /** Called after navigating, e.g. to close a mobile menu. */
  onNavigate?: () => void;
}

const MAX_SUGGESTIONS = 6;

/** Search input with an accessible autocomplete list (ARIA combobox pattern). */
export function SearchBox({ size = 'default', autoFocus, initialQuery = '', className, onNavigate }: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Only query AniList while suggestions are showing — keeps us well inside the rate limit.
  const search = useAnimeSearch(query, { delay: 250, perPage: 8, enabled: open });
  const suggestions = search.hits.slice(0, MAX_SUGGESTIONS);
  const showList = open && query.trim().length >= 2;
  // Options = suggestions + the "see all results" row.
  const optionCount = suggestions.length + 1;

  useEffect(() => {
    setActive(-1);
  }, [search.query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
    onNavigate?.();
  };
  const goToResults = () => {
    const q = query.trim();
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  };
  const choose = (index: number) => {
    const hit = suggestions[index];
    if (hit) go(animePath({ anilistId: hit.item.id, title: hit.item.title }));
    else goToResults();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % optionCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? optionCount - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showList && active >= 0) choose(active);
      else goToResults();
    } else if (e.key === 'Escape') {
      if (showList) setOpen(false);
      else setQuery('');
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const lg = size === 'lg';

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goToResults();
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search all anime
        </label>
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center justify-center border-r-2 text-foreground',
            lg ? 'w-14 border-edge sm:w-16' : 'w-10 border-input',
          )}
        >
          <Search className={lg ? 'size-5' : 'size-4'} strokeWidth={2.5} />
        </span>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          placeholder={lg ? 'Search any anime — try “narut” or “attak titan”' : 'Search anime'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full appearance-none border-2 bg-surface text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-subtle-foreground focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden',
            lg
              ? 'h-14 border-edge pr-14 pl-[4.5rem] text-base shadow-hard focus:shadow-hard-lg sm:h-16 sm:pl-20 sm:text-lg'
              : 'h-10 border-input pr-10 pl-[3.25rem] text-sm focus:shadow-hard-sm',
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className={cn(
              'absolute top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              lg ? 'right-3' : 'right-0.5',
            )}
            aria-label="Clear search"
          >
            {search.isPending && query.trim().length >= 2 ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <X className="size-4" aria-hidden />
            )}
          </button>
        )}
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Anime suggestions"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-auto border-2 border-edge bg-surface p-1.5 shadow-hard"
        >
          {search.correctedTo && (
            <li role="presentation" className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
              Showing results for <span className="font-semibold text-foreground">{search.correctedTo}</span>
            </li>
          )}
          {suggestions.length === 0 && !search.isPending && (
            <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
              {search.error ? 'AniList is unavailable — showing local matches only.' : `No anime match “${query.trim()}”.`}
            </li>
          )}
          {suggestions.map((hit, i) => {
            const m = hit.item.media;
            const facts = [m?.seasonYear, formatFormat(m?.format ?? null)].filter(Boolean).join(', ');
            return (
              <li
                key={hit.item.id}
                id={optionId(i)}
                role="option"
                aria-selected={active === i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-3 px-2 py-2', active === i && 'bg-surface-2 dark:bg-surface-3')}
              >
                <div className="h-12 w-8 shrink-0 overflow-hidden bg-surface-3">
                  {m?.coverImage.medium && (
                    <img src={m.coverImage.medium} alt="" loading="lazy" className="size-full object-cover" width={32} height={48} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    <Highlight text={hit.item.title} ranges={hit.highlights} />
                  </p>
                  {facts && <p className="truncate text-xs text-muted-foreground">{facts}</p>}
                </div>
                {hit.item.catalog ? (
                  <span className="shrink-0 border border-canon/25 bg-canon/10 px-2 py-0.5 text-[11px] font-medium text-canon-text">
                    Filler data
                  </span>
                ) : null}
              </li>
            );
          })}
          <li
            id={optionId(suggestions.length)}
            role="option"
            aria-selected={active === suggestions.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={goToResults}
            onMouseEnter={() => setActive(suggestions.length)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground',
              active === suggestions.length && 'bg-surface-2 text-foreground dark:bg-surface-3',
            )}
          >
            <Search className="size-4" aria-hidden />
            See all results for “{query.trim()}”
          </li>
        </ul>
      )}
    </div>
  );
}
