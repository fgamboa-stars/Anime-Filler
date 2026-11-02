import { useMemo } from 'react';
import popularTitles from '@/data/popular-titles.json';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { AniListError, displayTitle, searchAnime, type MediaSummary } from '@/services/anilist';
import { findCatalogByAniListId, getCatalog } from '@/services/datasets';
import type { CatalogEntry } from '@/types';
import { rankResults, suggestCorrection, type RankedItem } from './searchEngine';

export interface SearchHit {
  /** AniList id (always known for datasets, too). */
  id: number;
  title: string;
  altTitles: string[];
  media: MediaSummary | null;
  catalog: CatalogEntry | null;
}

export interface SearchOutcome {
  hits: RankedItem<SearchHit>[];
  /** When AniList found nothing for the typed query, the corrected title we searched instead. */
  correctedTo: string | null;
}

const toHit = (media: MediaSummary): SearchHit => ({
  id: media.id,
  title: displayTitle(media.title),
  altTitles: [media.title.romaji, media.title.english, media.title.native, ...media.synonyms].filter((t): t is string => !!t),
  media,
  catalog: findCatalogByAniListId(media.id) ?? null,
});

const catalogHit = (entry: CatalogEntry): SearchHit => ({
  id: entry.anilistId,
  title: entry.title,
  altTitles: entry.alternativeTitles,
  media: null,
  catalog: entry,
});

const correctionPool = (): string[] => [...getCatalog().flatMap((c) => [c.title, ...c.alternativeTitles]), ...popularTitles];

/** Merge AniList results with matching local datasets (which also work offline). */
export function mergeHits(query: string, remote: MediaSummary[]): RankedItem<SearchHit>[] {
  const hits = remote.map(toHit);
  const ids = new Set(hits.map((h) => h.id));
  const localMatches = rankResults(query, getCatalog().map(catalogHit)).filter((r) => r.score < 1 && !ids.has(r.item.id));
  return rankResults(query, [...hits, ...localMatches.map((r) => r.item)]);
}

export async function runSearch(query: string, signal?: AbortSignal, perPage = 12): Promise<SearchOutcome> {
  const remote = await searchAnime(query, { signal, perPage });
  if (remote.length > 0) return { hits: mergeHits(query, remote), correctedTo: null };

  // AniList's search is exact-ish; retry once with a fuzzy-corrected title.
  const corrected = suggestCorrection(query, correctionPool());
  if (corrected) {
    const retry = await searchAnime(corrected, { signal, perPage });
    if (retry.length > 0) return { hits: mergeHits(corrected, retry), correctedTo: corrected };
  }
  return { hits: mergeHits(query, []), correctedTo: null };
}

export function useAnimeSearch(
  query: string,
  { delay = 300, perPage = 12, enabled = true }: { delay?: number; perPage?: number; enabled?: boolean } = {},
) {
  const debounced = useDebouncedValue(query.trim(), delay);
  const active = enabled && debounced.length >= 2 ? debounced : null;
  const state = useAsync(active ? `search:${perPage}:${active.toLowerCase()}` : null, (signal) => runSearch(active!, signal, perPage));

  // Local dataset matches are available instantly and survive AniList outages.
  const local = useMemo(() => (active ? mergeHits(active, []) : []), [active]);

  const isRateLimited = state.status === 'error' && state.error instanceof AniListError && state.error.kind === 'rate-limit';
  return {
    query: active,
    isPending: query.trim() !== debounced || state.status === 'loading',
    status: state.status,
    error: state.status === 'error' ? state.error : null,
    isRateLimited,
    hits: state.data?.hits ?? (state.status === 'error' || state.status === 'loading' ? local : []),
    correctedTo: state.data?.correctedTo ?? null,
    retry: state.retry,
  };
}
