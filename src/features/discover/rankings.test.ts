import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@/types';
import { groupCatalog } from '@/utils/franchise';
import { isAnimeOriginal, rankLeastFiller, rankMostFiller } from './rankings';

function entry(slug: string, canon: number, filler: number): CatalogEntry {
  return {
    slug,
    anilistId: slug.length,
    title: slug,
    alternativeTitles: [],
    totalEpisodes: canon + filler,
    counts: { CANON: canon, MIXED: 0, ANIME_CANON: 0, FILLER: filler },
    fillerPercentage: Math.round((filler / (canon + filler)) * 1000) / 10,
    arcCount: 0,
    strip: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as CatalogEntry;
}

const groups = groupCatalog([
  entry('anime-original', 0, 100),
  entry('heavy', 40, 60),
  entry('light', 95, 5),
  entry('none', 24, 0),
]);

describe('discover rankings', () => {
  it('recognises anime-original series', () => {
    expect(isAnimeOriginal({ CANON: 0, MIXED: 0, ANIME_CANON: 0, FILLER: 12 })).toBe(true);
    expect(isAnimeOriginal({ CANON: 1, MIXED: 0, ANIME_CANON: 0, FILLER: 12 })).toBe(false);
    expect(isAnimeOriginal({ CANON: 0, MIXED: 0, ANIME_CANON: 0, FILLER: 0 })).toBe(false);
  });

  it('leaves anime-original series out of "Most filler"', () => {
    expect(rankMostFiller(groups).map((g) => g.key)).toEqual(['heavy', 'light']);
  });

  it('leaves filler-free series out of "Least filler"', () => {
    expect(rankLeastFiller(groups).map((g) => g.key)).toEqual(['light', 'heavy']);
  });
});
