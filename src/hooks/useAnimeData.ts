import { getAnimeByIds, getAnimeDetail, getTopRated } from '@/services/anilist';
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

export function useDataset(slug: string | null) {
  return useAsync(slug ? `dataset:${slug}` : null, () => loadDataset(slug!));
}
