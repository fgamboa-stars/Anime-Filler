import { beforeEach, describe, expect, it } from 'vitest';
import { progressStats, selectInProgress, useProgressStore } from './progressStore';

const meta = { title: 'Naruto', totalEpisodes: 220 };
const get = () => useProgressStore.getState();

beforeEach(() => {
  useProgressStore.setState({ progress: {} });
});

describe('progress store', () => {
  it('toggles an episode on and off', () => {
    get().toggleEpisode('naruto', 5, meta);
    expect(get().progress.naruto.watched).toEqual([5]);
    expect(get().progress.naruto.lastWatched).toBe(5);
    get().toggleEpisode('naruto', 5, meta);
    expect(get().progress.naruto).toBeUndefined();
  });

  it('marks everything up to an episode', () => {
    get().toggleEpisode('naruto', 40, meta);
    get().markUpTo('naruto', 10, meta);
    expect(get().progress.naruto.watched).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40]);
    expect(get().progress.naruto.lastWatched).toBe(10);
  });

  it('bulk sets and clears episodes', () => {
    get().setEpisodes('naruto', [3, 1, 2], true, meta);
    expect(get().progress.naruto.watched).toEqual([1, 2, 3]);
    get().setEpisodes('naruto', [2], false, meta);
    expect(get().progress.naruto.watched).toEqual([1, 3]);
  });

  it('resets one anime without touching others', () => {
    get().toggleEpisode('naruto', 1, meta);
    get().toggleEpisode('naruto-shippuden', 1, { title: 'Naruto Shippuden', totalEpisodes: 500 });
    get().resetAnime('naruto');
    expect(Object.keys(get().progress)).toEqual(['naruto-shippuden']);
  });

  it('persists to localStorage', () => {
    get().markUpTo('naruto', 3, meta);
    const saved = JSON.parse(localStorage.getItem('aff:progress') ?? '{}');
    expect(saved.state.progress.naruto.watched).toEqual([1, 2, 3]);
  });

  it('orders in-progress anime by most recent update', async () => {
    get().toggleEpisode('naruto', 1, meta);
    await new Promise((r) => setTimeout(r, 5));
    get().toggleEpisode('naruto-shippuden', 1, { title: 'Naruto Shippuden', totalEpisodes: 500 });
    expect(selectInProgress(get().progress).map((p) => p.slug)).toEqual(['naruto-shippuden', 'naruto']);
  });
});

describe('progressStats', () => {
  it('computes count, percentage and next episode', () => {
    const stats = progressStats({ watched: Array.from({ length: 245 }, (_, i) => i + 1), lastWatched: 245 }, 500);
    expect(stats).toEqual({ watchedCount: 245, total: 500, percent: 49, nextEpisode: 246 });
  });

  it('skips ineligible episodes (e.g. filler) when finding the next one', () => {
    const stats = progressStats({ watched: [1, 2], lastWatched: 2 }, 10, (n) => n !== 3 && n !== 4);
    expect(stats.nextEpisode).toBe(5);
  });

  it('wraps around to earlier gaps and reports null when finished', () => {
    expect(progressStats({ watched: [2, 3], lastWatched: 3 }, 3).nextEpisode).toBe(1);
    expect(progressStats({ watched: [1, 2, 3], lastWatched: 3 }, 3).nextEpisode).toBeNull();
    expect(progressStats(undefined, 3)).toEqual({ watchedCount: 0, total: 3, percent: 0, nextEpisode: 1 });
  });
});
