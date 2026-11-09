import { getAnimeByIds, getAnimeDetail, getLikelyNoFiller, getTopRated, type MediaSummary } from '@/services/anilist';
import { loadDataset } from '@/services/datasets';
import { useAsync } from './useAsync';

export function useAnimeDetail(id: number | null) {
  return useAsync(id ? `detail:${id}` : null, (signal) => getAnimeDetail(id!, { signal }));
}

export function useAnimeByIds(ids: number[]) {
  const key = ids.length ? `ids:${[...ids].sort((a, b) => a - b).join(',')}` : null;
  return useAsync(key, (signal) => getAnimeByIds(ids, { signal }));
}

export function useTopRated(perPage = 12) {
  return useAsync(`top:${perPage}`, (signal) => getTopRated({ signal, perPage }));
}

/** The first `pages` pages of the "likely no filler" list (each page is cached separately). */
export function useLikelyNoFiller(pages: number, enabled = true) {
  return useAsync(enabled ? `likely:${pages}` : null, async (signal) => {
    const media: MediaSummary[] = [];
    let hasNextPage = false;
    for (let page = 1; page <= pages; page++) {
      const result = await getLikelyNoFiller({ signal, page });
      media.push(...result.media);
      hasNextPage = result.hasNextPage;
      if (!hasNextPage) break;
    }
    return { media, hasNextPage };
  });
}

export function useDataset(slug: string | null) {
  return useAsync(slug ? `dataset:${slug}` : null, () => loadDataset(slug!));
}
