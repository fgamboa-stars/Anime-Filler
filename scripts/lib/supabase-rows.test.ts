import { describe, expect, it } from 'vitest';
import { chunk, toRows } from './supabase-rows.ts';
import { listDatasets } from './catalog.ts';

describe('supabase seed rows', () => {
  it('converts every local guide to valid rows', () => {
    const all = listDatasets();
    expect(all.length).toBeGreaterThan(300);
    for (const d of all) {
      const { dataset, episodes } = toRows(d);
      expect(dataset.slug).toBe(d.slug);
      expect(episodes).toHaveLength(d.episodes.length);
      expect(new Set(episodes.map((e) => e.number)).size).toBe(episodes.length);
      for (const e of episodes) expect(['CANON', 'FILLER', 'MIXED', 'ANIME_CANON']).toContain(e.type);
    }
  });
  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
