import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@/types';
import { emptyCounts } from './dataset';
import { franchiseSiblings, groupCatalog, groupStrip, seasonLabel } from './franchise';

const entry = (slug: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  slug,
  anilistId: slug.length,
  title: slug,
  alternativeTitles: [],
  totalEpisodes: 3,
  counts: { ...emptyCounts(), CANON: 2, FILLER: 1 },
  fillerPercentage: 33.3,
  arcCount: 1,
  strip: 'C2F1',
  updatedAt: '',
  ...extra,
});

describe('groupCatalog', () => {
  const catalog = [
    entry('show-s2', { franchise: 'Show', seasonLabel: 'Season 2', franchiseOrder: 2 }),
    entry('solo'),
    entry('show', { franchise: 'Show', seasonLabel: 'Season 1', franchiseOrder: 1, strip: 'C3', counts: { ...emptyCounts(), CANON: 3 } }),
  ];
  const groups = groupCatalog(catalog);

  it('puts every season of a franchise in one group, in order', () => {
    expect(groups.map((g) => g.key).sort()).toEqual(['Show', 'solo']);
    const show = groups.find((g) => g.key === 'Show')!;
    expect(show.title).toBe('Show');
    expect(show.entries.map((e) => e.slug)).toEqual(['show', 'show-s2']);
    expect(show.first.slug).toBe('show');
  });

  it('adds up episodes and filler across seasons', () => {
    const show = groups.find((g) => g.key === 'Show')!;
    expect(show.totalEpisodes).toBe(6);
    expect(show.counts.FILLER).toBe(1);
    expect(show.fillerPercentage).toBe(16.7);
  });

  it('draws one continuous strip for the whole franchise', () => {
    const show = groups.find((g) => g.key === 'Show')!;
    expect(groupStrip(show).map((e) => `${e.number}${e.type[0]}`)).toEqual(['1C', '2C', '3C', '4C', '5C', '6F']);
  });

  it('lists siblings and labels', () => {
    expect(franchiseSiblings(catalog, catalog[0]).map((e) => seasonLabel(e))).toEqual(['Season 1', 'Season 2']);
    expect(franchiseSiblings(catalog, catalog[1])).toEqual([]);
    expect(seasonLabel(catalog[1])).toBe('solo');
  });
});
