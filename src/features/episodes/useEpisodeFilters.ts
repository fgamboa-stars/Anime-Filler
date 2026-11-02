import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePreferencesStore } from '@/store/preferencesStore';
import { applyFiltersToParams, parseFilters, parseView, type AnimeView, type EpisodeFilters } from './filterEpisodes';

/**
 * URL-backed filter state. Every change is a real history entry, so refresh,
 * bookmarks, deep links and back/forward all work. Typing in the search box
 * replaces the current entry instead of adding one per keystroke.
 */
export function useEpisodeFilters(slug?: string) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const view = parseView(params);
  const rememberFilters = usePreferencesStore((s) => s.rememberFilters);

  const setFilters = useCallback(
    (patch: Partial<EpisodeFilters>, { replace = false }: { replace?: boolean } = {}) => {
      setParams((prev) => applyFiltersToParams({ ...parseFilters(prev), ...patch }, prev), { replace });
    },
    [setParams],
  );

  const setView = useCallback(
    (next: AnimeView) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'episodes') p.delete('view');
        else p.set('view', next);
        return p;
      });
    },
    [setParams],
  );

  const resetFilters = useCallback(() => {
    setParams((prev) => {
      const p = new URLSearchParams();
      const v = prev.get('view');
      if (v) p.set('view', v);
      return p;
    });
  }, [setParams]);

  const filterSearch = applyFiltersToParams(filters, new URLSearchParams()).toString();
  useEffect(() => {
    if (slug) rememberFilters(slug, filterSearch);
  }, [slug, filterSearch, rememberFilters]);

  return { filters, view, setFilters, setView, resetFilters };
}
