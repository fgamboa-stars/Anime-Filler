import { useEffect, useId, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, EyeOff, Eye, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Window } from '@/components/retro/Window';
import { ToggleChip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  // Small screens: arc / show / sort / spoiler controls sit behind a "Filters" disclosure.
  const [moreOpen, setMoreOpen] = useState(false);

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

  const advancedCount = (filters.arc ? 1 : 0) + (filters.watched !== 'all' ? 1 : 0) + (filters.sort === 'desc' ? 1 : 0);

  return (
    <Window title="filters.cfg" bodyClassName="flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-q`} className="sr-only">
            Find an episode
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title or number"
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          className="md:hidden"
          aria-expanded={moreOpen}
          aria-controls={`${id}-more`}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden />
          Filters
          {advancedCount > 0 && (
            <span className="tabular inline-flex size-5 items-center justify-center bg-primary text-[11px] text-primary-foreground">
              {advancedCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </div>

      <fieldset className="min-w-0">
        <legend className="sr-only">Episode type</legend>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <ToggleChip pressed={filters.types.length === 0} onPressedChange={() => onChange({ types: [] })}>
            All types
          </ToggleChip>
          {TYPES.filter((t) => counts[t] > 0).map((t) => {
            const on = filters.types.includes(t);
            return (
              <ToggleChip key={t} pressed={on} onPressedChange={() => toggleType(t)}>
                <span aria-hidden className={cn('size-2.5 ', TYPE_COLOR_CLASS[t], on && 'ring-2 ring-background/30')} />
                {TYPE_LABELS[t]}
                <span className={cn('tabular text-xs', on ? 'text-background/70' : 'text-subtle-foreground')}>{counts[t]}</span>
              </ToggleChip>
            );
          })}
        </div>
      </fieldset>

      <div
        id={`${id}-more`}
        className={cn(
          'grid gap-3 border-t border-border pt-4 sm:grid-cols-2 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto]',
          moreOpen ? 'grid' : 'hidden',
        )}
      >
        <div>
          <label htmlFor={`${id}-arc`} className="mb-1.5 block text-caption">
            Arc
          </label>
          <Select id={`${id}-arc`} value={filters.arc ?? ''} onChange={(e) => onChange({ arc: e.target.value || null })}>
            <option value="">All arcs</option>
            {arcs.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.ranges.map((r) => (r.start === r.end ? r.start : `${r.start}–${r.end}`)).join(', ')})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-watched`} className="mb-1.5 block text-caption">
            Show
          </label>
          <Select
            id={`${id}-watched`}
            value={filters.watched}
            onChange={(e) => onChange({ watched: e.target.value as Filters['watched'] })}
          >
            <option value="all">All episodes</option>
            <option value="unwatched">Unwatched</option>
            <option value="watched">Watched</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onChange({ sort: filters.sort === 'asc' ? 'desc' : 'asc' })}
            title={filters.sort === 'asc' ? 'Switch to newest first' : 'Switch to oldest first'}
          >
            {filters.sort === 'asc' ? <ArrowUpNarrowWide aria-hidden /> : <ArrowDownWideNarrow aria-hidden />}
            {filters.sort === 'asc' ? 'Oldest first' : 'Newest first'}
          </Button>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            className="w-full"
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
        <div className="-mt-1 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden />
            Reset filters
          </Button>
        </div>
      )}
    </Window>
  );
}
