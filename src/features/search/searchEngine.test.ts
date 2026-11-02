import { describe, expect, it } from 'vitest';
import popular from '@/data/popular-titles.json';
import { fuzzyRank, rankResults, suggestCorrection, mergeRanges, type Searchable } from './searchEngine';

const pool: Searchable[] = [
  { title: 'Naruto', altTitles: ['NARUTO'] },
  { title: 'Naruto Shippuden', altTitles: ['Naruto: Shippuuden'] },
  { title: 'Bleach', altTitles: ['BLEACH'] },
  { title: 'Attack on Titan', altTitles: ['Shingeki no Kyojin'] },
  { title: 'One Piece', altTitles: ['ONE PIECE'] },
  { title: 'Black Clover', altTitles: [] },
  { title: 'Boruto: Naruto Next Generations', altTitles: [] },
];

const top = (q: string) => fuzzyRank(q, pool)[0]?.item.title;

describe('fuzzyRank', () => {
  it.each([
    ['narut', 'Naruto'],
    ['shipp', 'Naruto Shippuden'],
    ['blech', 'Bleach'],
    ['attak titan', 'Attack on Titan'],
    ['shingeki', 'Attack on Titan'],
    ['one pice', 'One Piece'],
    ['Naruto', 'Naruto'],
  ])('"%s" → %s', (query, expected) => {
    expect(top(query)).toBe(expected);
  });

  it('returns nothing for an empty query', () => {
    expect(fuzzyRank('   ', pool)).toEqual([]);
  });

  it('returns nothing for unrelated input', () => {
    expect(fuzzyRank('zzzzqqq', pool)).toEqual([]);
  });

  it('reports highlight ranges inside the title', () => {
    const [hit] = fuzzyRank('shipp', pool);
    expect(hit.highlights.length).toBeGreaterThan(0);
    const [start, end] = hit.highlights[0];
    expect(hit.item.title.slice(start, end + 1).toLowerCase()).toContain('shipp');
  });
});

describe('suggestCorrection', () => {
  const titles = [...popular, 'Naruto', 'Naruto Shippuden'];

  it('corrects common typos from the popular title list', () => {
    expect(suggestCorrection('blech', titles)).toBe('Bleach');
    expect(suggestCorrection('attak titan', titles)).toBe('Attack on Titan');
    expect(suggestCorrection('jujutsu kaisn', titles)).toBe('Jujutsu Kaisen');
  });

  it('does not "correct" a query that is already exact', () => {
    expect(suggestCorrection('Bleach', titles)).toBeNull();
  });

  it('ignores very short queries', () => {
    expect(suggestCorrection('bl', titles)).toBeNull();
  });
});

describe('rankResults', () => {
  it('keeps unmatched remote results after fuzzy matches, in original order', () => {
    const remote: Searchable[] = [
      { title: 'Something Else', altTitles: [] },
      { title: 'Naruto', altTitles: [] },
      { title: 'Unrelated Show', altTitles: [] },
    ];
    expect(rankResults('naruto', remote).map((r) => r.item.title)).toEqual(['Naruto', 'Something Else', 'Unrelated Show']);
  });
});

describe('mergeRanges', () => {
  it('merges overlapping and adjacent ranges', () => {
    expect(mergeRanges([[5, 7], [0, 2], [3, 4], [10, 11]])).toEqual([[0, 7], [10, 11]]);
  });
});
