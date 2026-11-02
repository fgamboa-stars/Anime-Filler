import { useEffect, useId, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, EyeOff, Eye, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TYPE_COLOR_CLASS } from '@/components/EpisodeTypeBadge';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { Arc, EpisodeType, EpisodeTypeCounts } from '@/types';
import { TYPE_LABELS } from '@/utils/dataset';
import { cn } from '@/utils/cn';
import { hasActiveFilters, type EpisodeFilters as Filters } from './filterEpisodes';

interface EpisodeFiltersProps {
  filters: Filters;
  arcs: Arc[];
  counts: EpisodeTypeCounts;
  onChange: (patch: Partial<Filters>, opts?: { replace?: boolean }) => void;
  onReset: () => void;
}

const TYPES: EpisodeType[] = ['CANON', 'MIXED', 'ANIME_CANON', 'FILLER'];

export function EpisodeFilters({ filters, arcs, counts, onChange, onReset }: EpisodeFiltersProps) {
  const id = useId();
  const [query, setQuery] = useState(filters.query);
  const hideTitles = usePreferencesStore((s) => s.hideEpisodeTitles);
  const setHideTitles = usePreferencesStore((s) => s.setHideEpisodeTitles);

  // Keep the text box in sync with back/forward navigation.
  useEffect(() => {
    setQuery(filters.query);
  }, [filters.query]);
  // Debounced write to the URL (replace, so typing doesn't flood history).
  useEffect(() => {
    if (query === filters.query) return;
    const t = setTimeout(() => onChange({ query }, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [query, filters.query, onChange]);

  const toggleType = (t: EpisodeType) => {
    const set = new Set(filters.types);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    onChange({ types: TYPES.filter((x) => set.has(x)) });
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="sr-only">Episode type</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filters.types.length === 0}
            onClick={() => onChange({ types: [] })}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-semibold transition-colors',
              filters.types.length === 0 ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-secondary',
            )}
          >
            All types
          </button>
          {TYPES.filter((t) => counts[t] > 0).map((t) => {
            const on = filters.types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
                  on ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-secondary',
                )}
              >
                <span aria-hidden className={cn('size-2.5 rounded-[2px]', TYPE_COLOR_CLASS[t])} />
                {TYPE_LABELS[t]}
                <span className={cn('tabular text-xs', on ? 'text-background/70' : 'text-muted-foreground')}>{counts[t]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]">
        <div>
          <label htmlFor={`${id}-arc`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Arc
          </label>
          <select
            id={`${id}-arc`}
            value={filters.arc ?? ''}
            onChange={(e) => onChange({ arc: e.target.value || null })}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">All arcs</option>
            {arcs.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.ranges.map((r) => (r.start === r.end ? r.start : `${r.start}–${r.end}`)).join(', ')})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-q`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Find an episode
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id={`${id}-q`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title or number"
              className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-watched`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Show
          </label>
          <select
            id={`${id}-watched`}
            value={filters.watched}
            onChange={(e) => onChange({ watched: e.target.value as Filters['watched'] })}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">All episodes</option>
            <option value="unwatched">Unwatched</option>
            <option value="watched">Watched</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            className="h-10 w-full rounded-lg"
            onClick={() => onChange({ sort: filters.sort === 'asc' ? 'desc' : 'asc' })}
            title={filters.sort === 'asc' ? 'Switch to newest first' : 'Switch to oldest first'}
          >
            {filters.sort === 'asc' ? <ArrowUpNarrowWide aria-hidden /> : <ArrowDownWideNarrow aria-hidden />}
            {filters.sort === 'asc' ? 'Oldest first' : 'Newest first'}
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            className="h-10 w-full rounded-lg"
            aria-pressed={hideTitles}
            onClick={() => setHideTitles(!hideTitles)}
            title="Blur episode titles to avoid spoilers"
          >
            {hideTitles ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            {hideTitles ? 'Show titles' : 'Hide titles'}
          </Button>
        </div>
      </div>

      {hasActiveFilters(filters) && (
        <div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden />
            Reset filters
          </Button>
        </div>
      )}
    </div>
  );
}
