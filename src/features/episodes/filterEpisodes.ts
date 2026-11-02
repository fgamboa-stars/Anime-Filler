import type { Episode, EpisodeType } from '@/types';
import { TYPE_PARAMS, typeFromParam } from '@/utils/dataset';

export type SortOrder = 'asc' | 'desc';
export type WatchedFilter = 'all' | 'unwatched' | 'watched';
export type AnimeView = 'episodes' | 'watch-order' | 'arcs';

export interface EpisodeFilters {
  types: EpisodeType[];
  arc: string | null;
  query: string;
  sort: SortOrder;
  watched: WatchedFilter;
}

export const DEFAULT_FILTERS: EpisodeFilters = { types: [], arc: null, query: '', sort: 'asc', watched: 'all' };

/** Read filters from URL params, ignoring anything invalid. */
export function parseFilters(params: URLSearchParams): EpisodeFilters {
  const types = (params.get('type') ?? '')
    .split(',')
    .map(typeFromParam)
    .filter((t): t is EpisodeType => t !== null);
  const sort = params.get('sort') === 'desc' ? 'desc' : 'asc';
  const watchedParam = params.get('watched');
  const watched: WatchedFilter = watchedParam === 'unwatched' || watchedParam === 'watched' ? watchedParam : 'all';
  return {
    types: [...new Set(types)],
    arc: params.get('arc') || null,
    query: params.get('q') ?? '',
    sort,
    watched,
  };
}

/** Write filters into URL params, leaving unrelated params (e.g. `view`) untouched and omitting defaults. */
export function applyFiltersToParams(filters: EpisodeFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
  set('type', filters.types.length ? filters.types.map((t) => TYPE_PARAMS[t]).join(',') : null);
  set('arc', filters.arc);
  set('q', filters.query.trim() ? filters.query : null);
  set('sort', filters.sort === 'desc' ? 'desc' : null);
  set('watched', filters.watched === 'all' ? null : filters.watched);
  return next;
}

export function parseView(params: URLSearchParams): AnimeView {
  const v = params.get('view');
  return v === 'watch-order' || v === 'arcs' ? v : 'episodes';
}

export function hasActiveFilters(f: EpisodeFilters): boolean {
  return f.types.length > 0 || f.arc !== null || f.query.trim() !== '' || f.watched !== 'all';
}

export function filterEpisodes(episodes: Episode[], filters: EpisodeFilters, watched: ReadonlySet<number> = new Set()): Episode[] {
  const types = new Set(filters.types);
  const q = filters.query.trim().toLowerCase();
  const asNumber = /^\d+$/.test(q) ? Number(q) : null;
  const out = episodes.filter((ep) => {
    if (types.size && !types.has(ep.type)) return false;
    if (filters.arc && ep.arcSlug !== filters.arc) return false;
    if (filters.watched === 'watched' && !watched.has(ep.number)) return false;
    if (filters.watched === 'unwatched' && watched.has(ep.number)) return false;
    if (q) {
      if (asNumber !== null) return ep.number === asNumber || ep.title.toLowerCase().includes(q);
      return ep.title.toLowerCase().includes(q) || ep.arc.toLowerCase().includes(q);
    }
    return true;
  });
  return filters.sort === 'desc' ? out.reverse() : out;
}
