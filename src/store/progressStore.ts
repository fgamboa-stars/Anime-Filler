import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface AnimeProgress {
  slug: string;
  title: string;
  totalEpisodes: number;
  /** Sorted, unique episode numbers. */
  watched: number[];
  lastWatched: number | null;
  updatedAt: number;
}

export interface AnimeMeta {
  title: string;
  totalEpisodes: number;
}

interface ProgressState {
  progress: Record<string, AnimeProgress>;
  toggleEpisode: (slug: string, episode: number, meta: AnimeMeta) => void;
  setEpisodes: (slug: string, episodes: number[], watched: boolean, meta: AnimeMeta) => void;
  /** Mark 1..episode watched (everything up to and including `episode`). */
  markUpTo: (slug: string, episode: number, meta: AnimeMeta) => void;
  resetAnime: (slug: string) => void;
}

const sortUnique = (n: number[]) => [...new Set(n)].sort((a, b) => a - b);

function update(state: ProgressState, slug: string, meta: AnimeMeta, watched: number[], last: number | null): ProgressState['progress'] {
  const next = { ...state.progress };
  if (watched.length === 0) {
    delete next[slug];
    return next;
  }
  next[slug] = { slug, title: meta.title, totalEpisodes: meta.totalEpisodes, watched, lastWatched: last, updatedAt: Date.now() };
  return next;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      progress: {},
      toggleEpisode: (slug, episode, meta) =>
        set((state) => {
          const current = state.progress[slug]?.watched ?? [];
          const has = current.includes(episode);
          const watched = has ? current.filter((n) => n !== episode) : sortUnique([...current, episode]);
          const last = has ? (state.progress[slug]?.lastWatched === episode ? (watched[watched.length - 1] ?? null) : (state.progress[slug]?.lastWatched ?? null)) : episode;
          return { progress: update(state, slug, meta, watched, last) };
        }),
      setEpisodes: (slug, episodes, watched, meta) =>
        set((state) => {
          const current = new Set(state.progress[slug]?.watched ?? []);
          for (const e of episodes) watched ? current.add(e) : current.delete(e);
          const list = sortUnique([...current]);
          const last = watched && episodes.length ? Math.max(...episodes) : (list[list.length - 1] ?? null);
          return { progress: update(state, slug, meta, list, last) };
        }),
      markUpTo: (slug, episode, meta) =>
        set((state) => {
          const current = state.progress[slug]?.watched ?? [];
          const upTo = Array.from({ length: episode }, (_, i) => i + 1);
          return { progress: update(state, slug, meta, sortUnique([...current, ...upTo]), episode) };
        }),
      resetAnime: (slug) =>
        set((state) => {
          const next = { ...state.progress };
          delete next[slug];
          return { progress: next };
        }),
    }),
    {
      name: 'aff:progress',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ progress: s.progress }),
    },
  ),
);

export interface ProgressStats {
  watchedCount: number;
  total: number;
  percent: number;
  /** First unwatched episode after the most recently watched one (or the first unwatched overall). */
  nextEpisode: number | null;
}

export function progressStats(entry: Pick<AnimeProgress, 'watched' | 'lastWatched'> | undefined, total: number, eligible?: (n: number) => boolean): ProgressStats {
  const watched = new Set(entry?.watched ?? []);
  const watchedCount = [...watched].filter((n) => n >= 1 && n <= total).length;
  const percent = total ? Math.floor((watchedCount / total) * 100) : 0;
  const ok = (n: number) => !watched.has(n) && (eligible ? eligible(n) : true);
  let nextEpisode: number | null = null;
  const start = (entry?.lastWatched ?? 0) + 1;
  for (let n = start; n <= total; n++) if (ok(n)) { nextEpisode = n; break; }
  if (nextEpisode === null) for (let n = 1; n < start && n <= total; n++) if (ok(n)) { nextEpisode = n; break; }
  return { watchedCount, total, percent, nextEpisode };
}

/** Most recently updated first. */
export function selectInProgress(progress: Record<string, AnimeProgress>): AnimeProgress[] {
  return Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt);
}
