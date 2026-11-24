import { describe, expect, it } from 'vitest';
import type { FillerDataset } from '../../src/types/index.ts';
import { blockArc, mergeAiring } from './airing.ts';

const base: FillerDataset = {
  schemaVersion: 1,
  slug: 'show',
  anilistId: 1,
  title: 'Show',
  alternativeTitles: [],
  totalEpisodes: 2,
  updatedAt: '2026-01-01T00:00:00.000Z',
  episodes: [
    { number: 1, title: 'One', type: 'CANON', arc: 'Arc A' },
    { number: 2, title: 'Two', type: 'CANON', arc: 'Arc B' },
  ],
};

describe('mergeAiring', () => {
  it('adds new episodes to the last arc and keeps existing arcs', () => {
    const { dataset, added, changed } = mergeAiring(
      base,
      [
        { number: 1, title: 'One', type: 'CANON' },
        { number: 2, title: 'Two', type: 'FILLER' },
        { number: 3, title: 'Three', type: 'CANON' },
      ],
      'continue',
    );
    expect(added).toBe(1);
    expect(changed).toBe(1);
    expect(dataset.totalEpisodes).toBe(3);
    expect(dataset.episodes.map((e) => e.arc)).toEqual(['Arc A', 'Arc B', 'Arc B']);
    expect(dataset.episodes[1].type).toBe('FILLER');
  });

  it('groups by hundreds for block rules', () => {
    expect(blockArc(1)).toBe('Episodes 1–100');
    expect(blockArc(1201)).toBe('Episodes 1201–1300');
    const { dataset } = mergeAiring(base, [{ number: 101, title: 'x', type: 'CANON' }], 'blocks-100');
    expect(dataset.episodes.at(-1)?.arc).toBe('Episodes 101–200');
  });

  it('leaves updatedAt alone when nothing changed', () => {
    const { dataset } = mergeAiring(base, [{ number: 1, title: 'One', type: 'CANON' }], 'continue');
    expect(dataset.updatedAt).toBe(base.updatedAt);
  });
});
