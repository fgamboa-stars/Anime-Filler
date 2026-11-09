import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnimeByIds, isLikelyNoFiller, resetAniListState } from './anilist';
import { cacheClear } from './cache';
import { media, mockAniList } from '@/test/anilistMock';

beforeEach(() => {
  cacheClear();
  resetAniListState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isLikelyNoFiller', () => {
  const base = { status: 'FINISHED', format: 'TV', episodes: 12 } as const;

  it('accepts finished TV series of up to 26 episodes', () => {
    expect(isLikelyNoFiller(base)).toBe(true);
    expect(isLikelyNoFiller({ ...base, episodes: 26 })).toBe(true);
    expect(isLikelyNoFiller({ ...base, format: 'ONA' })).toBe(true);
  });

  it('rejects long, unfinished, non-series or unknown entries', () => {
    expect(isLikelyNoFiller({ ...base, episodes: 27 })).toBe(false);
    expect(isLikelyNoFiller({ ...base, status: 'RELEASING' })).toBe(false);
    expect(isLikelyNoFiller({ ...base, status: 'HIATUS' })).toBe(false);
    expect(isLikelyNoFiller({ ...base, format: 'MOVIE' })).toBe(false);
    expect(isLikelyNoFiller({ ...base, episodes: null })).toBe(false);
    expect(isLikelyNoFiller(null)).toBe(false);
  });
});

describe('getAnimeByIds', () => {
  it('fetches more than 50 IDs in chunks of 50', async () => {
    const fetch = mockAniList((variables) => ({
      body: { data: { Page: { media: (variables.ids as number[]).map((id) => media(id, `Anime ${id}`)) } } },
    }));
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const result = await getAnimeByIds(ids);
    expect(result).toHaveLength(120);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
