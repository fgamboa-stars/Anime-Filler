import { describe, expect, it } from 'vitest';
import naruto from '@/data/anime/naruto.json';
import type { FillerDataset } from '@/types';
import { prepareDataset } from '@/utils/dataset';
import { applyFiltersToParams, DEFAULT_FILTERS, filterEpisodes, hasActiveFilters, parseFilters, parseView } from './filterEpisodes';

const dataset = prepareDataset(naruto as FillerDataset);

describe('parseFilters', () => {
  it('reads type, arc, query, sort and watched params', () => {
    const f = parseFilters(new URLSearchParams('type=filler,anime-canon&arc=chunin-exams&q=sasuke&sort=desc&watched=unwatched'));
    expect(f).toEqual({ types: ['FILLER', 'ANIME_CANON'], arc: 'chunin-exams', query: 'sasuke', sort: 'desc', watched: 'unwatched' });
  });

  it('drops invalid values instead of failing', () => {
    expect(parseFilters(new URLSearchParams('type=banana,canon,canon&sort=sideways&watched=maybe'))).toEqual({
      ...DEFAULT_FILTERS,
      types: ['CANON'],
    });
  });

  it('round-trips through URL params and keeps unrelated params', () => {
    const base = new URLSearchParams('view=episodes&utm=x');
    const filters = { ...DEFAULT_FILTERS, types: ['CANON' as const, 'MIXED' as const], arc: 'konoha-crush' };
    const params = applyFiltersToParams(filters, base);
    expect(params.get('view')).toBe('episodes');
    expect(params.get('utm')).toBe('x');
    expect(params.get('type')).toBe('canon,mixed');
    expect(params.has('sort')).toBe(false);
    expect(parseFilters(params)).toEqual(filters);
  });
});

describe('parseView', () => {
  it('defaults to episodes', () => {
    expect(parseView(new URLSearchParams(''))).toBe('episodes');
    expect(parseView(new URLSearchParams('view=watch-order'))).toBe('watch-order');
    expect(parseView(new URLSearchParams('view=nope'))).toBe('episodes');
  });
});

describe('filterEpisodes', () => {
  it('filters by type', () => {
    const result = filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, types: ['FILLER'] });
    expect(result).toHaveLength(90);
    expect(result.every((e) => e.type === 'FILLER')).toBe(true);
  });

  it('filters by arc slug', () => {
    const result = filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, arc: 'chunin-exams' });
    expect(result[0].number).toBe(20);
    expect(result[result.length - 1].number).toBe(67);
  });

  it('combines type and arc filters', () => {
    const result = filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, arc: 'chunin-exams', types: ['FILLER'] });
    expect(result.map((e) => e.number)).toEqual([26]);
  });

  it('searches titles and matches an episode number exactly', () => {
    expect(filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, query: 'rasengan' }).map((e) => e.number)).toContain(94);
    expect(filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, query: '136' }).map((e) => e.number)).toEqual([136]);
  });

  it('filters by watched state and sorts descending', () => {
    const watched = new Set([1, 2, 3]);
    expect(filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, watched: 'watched', sort: 'desc' }, watched).map((e) => e.number)).toEqual([3, 2, 1]);
    expect(filterEpisodes(dataset.episodes, { ...DEFAULT_FILTERS, watched: 'unwatched' }, watched)).toHaveLength(217);
  });

  it('knows when filters are active', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'desc' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, arc: 'x' })).toBe(true);
  });
});
