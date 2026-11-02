import { describe, expect, it } from 'vitest';
import naruto from '@/data/anime/naruto.json';
import shippuden from '@/data/anime/naruto-shippuden.json';
import type { EpisodeType, FillerDataset } from '@/types';
import { generateWatchOrder, hoursSaved, watchOrderToText } from './generateWatchOrder';

const eps = (spec: string) =>
  spec.split('').map((c, i) => ({
    number: i + 1,
    type: ({ C: 'CANON', F: 'FILLER', M: 'MIXED', A: 'ANIME_CANON' } as Record<string, EpisodeType>)[c],
  }));

describe('generateWatchOrder', () => {
  it('collapses consecutive episodes into ranges', () => {
    const order = generateWatchOrder(eps('CCCFFCMFA'));
    expect(order.watch).toEqual([
      { start: 1, end: 3 },
      { start: 6, end: 7 },
      { start: 9, end: 9 },
    ]);
    expect(order.skip).toEqual([
      { start: 4, end: 5 },
      { start: 8, end: 8 },
    ]);
    expect(order.watchCount).toBe(6);
    expect(order.skipCount).toBe(3);
  });

  it('can skip mixed and anime-canon episodes too', () => {
    const order = generateWatchOrder(eps('CMAF'), { includeMixed: false, includeAnimeCanon: false });
    expect(order.watch).toEqual([{ start: 1, end: 1 }]);
    expect(order.skip).toEqual([{ start: 2, end: 4 }]);
  });

  it('handles a series with no filler', () => {
    const order = generateWatchOrder(eps('CCC'));
    expect(order.skip).toEqual([]);
    expect(watchOrderToText(order, 'Test')).toContain('(nothing to skip)');
  });

  it('produces the known Naruto skip list', () => {
    const order = generateWatchOrder((naruto as FillerDataset).episodes);
    expect(order.skip.map((r) => `${r.start}-${r.end}`)).toEqual(['26-26', '97-97', '101-106', '136-140', '143-219']);
    expect(order.watchCount + order.skipCount).toBe(220);
  });

  it('covers all 500 Shippuden episodes exactly once', () => {
    const order = generateWatchOrder((shippuden as FillerDataset).episodes);
    const total = [...order.watch, ...order.skip].reduce((n, r) => n + r.end - r.start + 1, 0);
    expect(total).toBe(500);
    expect(order.skipCount).toBe(203);
  });

  it('formats a copyable text block', () => {
    const text = watchOrderToText(generateWatchOrder(eps('CCFFC')), 'Naruto — canon watch order', 'https://x.test/a');
    expect(text).toBe(
      ['Naruto — canon watch order', '', 'WATCH', '1-2', '5', '', 'SKIP', '3-4', '', '3 to watch, 2 to skip', 'Made with Anime Filler Finder: https://x.test/a'].join('\n'),
    );
  });

  it('estimates time saved', () => {
    expect(hoursSaved(90)).toBe(34.5);
  });
});
