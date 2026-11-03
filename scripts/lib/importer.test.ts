import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeStrip, encodeStrip, serializeDataset } from '../../src/utils/dataset.ts';
import { parseCsv, parseCsvRows } from './csv.ts';
import { buildDataset, buildReport, groupByAnime, normalizeType, validateRecords } from './importer.ts';
import { buildCatalog, listDatasets } from './catalog.ts';
import { validateCatalog, validateDataset } from './validate.ts';

const validate = (csv: string) => {
  const parsed = parseCsv(csv);
  return { parsed, ...validateRecords(parsed.headers, parsed.records) };
};

describe('CSV parser', () => {
  it('handles quotes, escaped quotes, commas, CRLF and a BOM', () => {
    const rows = parseCsvRows('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows.map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('tracks line numbers and skips blank lines', () => {
    const { records } = parseCsv('h1,h2\n\n1,2\n"multi\nline",3\n4,5\n');
    expect(records.map((r) => r.line)).toEqual([3, 4, 6]);
  });

  it('reports rows with the wrong number of columns', () => {
    const { records, errors } = parseCsv('a,b\n1,2\n1,2,3\n');
    expect(records).toHaveLength(1);
    expect(errors).toEqual([{ line: 3, message: 'Expected 2 columns but found 3' }]);
  });
});

describe('validateRecords', () => {
  it('accepts the documented format', () => {
    const { valid, rejected } = validate('animeTitle,episodeNumber,title,type,arc\nBleach,64,Rain of Memories,FILLER,Bount Arc\n');
    expect(rejected).toEqual([]);
    expect(valid[0]).toMatchObject({ animeTitle: 'Bleach', number: 64, title: 'Rain of Memories', type: 'FILLER', arc: 'Bount Arc' });
  });

  it('accepts friendly type names and header aliases', () => {
    expect(normalizeType('Manga Canon')).toBe('CANON');
    expect(normalizeType('Mixed Canon/Filler')).toBe('MIXED');
    expect(normalizeType('anime_canon')).toBe('ANIME_CANON');
    const { valid } = validate('Anime,Episode,Episode Title,Classification\nX,1,Pilot,Manga Canon\n');
    expect(valid[0]).toMatchObject({ type: 'CANON', arc: 'Standalone Episodes' });
  });

  it('rejects malformed rows with a reason and line number', () => {
    const { valid, rejected } = validate(
      [
        'animeTitle,episodeNumber,title,type,arc',
        'Bleach,1,Good,CANON,A',
        ',2,No anime,CANON,A',
        'Bleach,two,Bad number,CANON,A',
        'Bleach,0,Zero,CANON,A',
        'Bleach,3,,CANON,A',
        'Bleach,4,Bad type,SIDE_STORY,A',
      ].join('\n'),
    );
    expect(valid.map((v) => v.number)).toEqual([1]);
    expect(rejected.map((r) => r.line)).toEqual([3, 4, 5, 6, 7]);
    expect(rejected[3].reason).toBe('title is empty');
    expect(rejected[4].reason).toContain('SIDE_STORY');
  });

  it('prevents duplicate episodes within a file', () => {
    const { valid, rejected } = validate('animeTitle,episodeNumber,title,type\nBleach,5,A,CANON\nbleach,5,B,FILLER\n');
    expect(valid).toHaveLength(1);
    expect(rejected[0].reason).toBe('duplicate of episode 5 for "bleach" on line 2');
  });

  it('fails fast when required columns are missing', () => {
    const { missingColumns } = validate('animeTitle,title\nBleach,X\n');
    expect(missingColumns).toEqual(['episodeNumber', 'type']);
  });
});

describe('buildDataset', () => {
  const rows = validate(
    'animeTitle,episodeNumber,title,type,arc\nBleach,1,The Day I Became a Shinigami,CANON,Agent of the Shinigami\nBleach,2,A Shinigami\'s Work,CANON,Agent of the Shinigami\nBleach,4,Gap,FILLER,Side\n',
  ).valid;
  const now = new Date('2026-01-01T00:00:00Z');

  it('converts rows into a dataset linked by AniList ID', () => {
    const { dataset, added, gaps } = buildDataset(rows, { title: 'Bleach', anilistId: 269, now });
    expect(dataset).toMatchObject({ schemaVersion: 1, slug: 'bleach', anilistId: 269, totalEpisodes: 3, updatedAt: now.toISOString() });
    expect(added).toEqual([1, 2, 4]);
    expect(gaps).toEqual([3]);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it('merges into an existing dataset without duplicating episodes', () => {
    const existing = buildDataset(rows, { title: 'Bleach', anilistId: 269, now }).dataset;
    const update = validate('animeTitle,episodeNumber,title,type,arc\nBleach,2,A Shinigami\'s Work,CANON,Agent of the Shinigami\nBleach,3,New,CANON,Agent of the Shinigami\nBleach,4,Gap,MIXED,Side\n').valid;
    const result = buildDataset(update, { title: 'Bleach', anilistId: 269, existing, now });
    expect(result.dataset.episodes.map((e) => e.number)).toEqual([1, 2, 3, 4]);
    expect(result.added).toEqual([3]);
    expect(result.updated).toEqual([4]);
    expect(result.unchanged).toEqual([2]);
    expect(result.gaps).toEqual([]);
  });

  it('records franchise metadata and keeps it on later merges', () => {
    const first = buildDataset(rows, { title: 'Bleach', anilistId: 269, franchise: 'Bleach', seasonLabel: 'Original', franchiseOrder: 1, now });
    expect(first.dataset).toMatchObject({ franchise: 'Bleach', seasonLabel: 'Original', franchiseOrder: 1 });
    const again = buildDataset(rows.slice(0, 1), { title: 'Bleach', anilistId: 269, existing: first.dataset, now });
    expect(again.dataset).toMatchObject({ franchise: 'Bleach', seasonLabel: 'Original', franchiseOrder: 1 });
    expect(validateDataset(again.dataset)).toEqual([]);
  });

  it('replace mode drops episodes missing from the new file', () => {
    const existing = buildDataset(rows, { title: 'Bleach', anilistId: 269, now }).dataset;
    const result = buildDataset(rows.slice(0, 1), { title: 'Bleach', anilistId: 269, existing, mode: 'replace', now });
    expect(result.dataset.episodes).toHaveLength(1);
    expect(result.removed).toEqual([2, 4]);
  });

  it('groups multi-anime files and generates a readable report', () => {
    const { valid, rejected, parsed } = validate('animeTitle,episodeNumber,title,type\nA,1,x,CANON\nB,1,y,FILLER\nB,x,bad,CANON\n');
    const groups = groupByAnime(valid);
    expect([...groups.keys()]).toEqual(['A', 'B']);
    const result = buildDataset(groups.get('B')!, { title: 'B', anilistId: 2, now });
    const report = buildReport({
      file: 'x.csv',
      totalRecords: parsed.records.length,
      parseErrors: parsed.errors,
      rejected,
      unknownColumns: [],
      results: [{ result, outputPath: 'src/data/anime/b.json', anilistIdSource: '--anilist-id' }],
      dryRun: true,
    });
    expect(report).toContain('## B');
    expect(report).toContain('Rows rejected: 1');
    expect(report).toContain('| 4 | episodeNumber "x" is not a positive whole number |');
    expect(report).toContain('100% filler');
  });
});

describe('shipped datasets', () => {
  const datasets = listDatasets();
  const bySlug = Object.fromEntries(datasets.map((d) => [d.slug, d]));

  it('are all valid', () => {
    expect(datasets.length).toBeGreaterThanOrEqual(51);
    for (const d of datasets) expect(validateDataset(d), d.slug).toEqual([]);
  });

  it.each([
    // slug, episodes, filler episodes (cross-checked against AnimeFillerList's published totals)
    ['naruto', 220, 90],
    ['naruto-shippuden', 500, 203],
    ['bleach', 366, 163],
    ['pokemon', 1140, 235],
    ['sailor-moon', 46, 28],
    ['dragon-ball', 153, 21],
    ['boruto', 293, 28],
    ['black-clover', 170, 18],
    ['hunter-x-hunter', 148, 2],
    ['fairy-tail', 175, 35],
    ['fairy-tail-2014', 102, 26],
    ['fairy-tail-final-season', 51, 0],
    ['dragon-ball-z', 291, 38],
    ['dragon-ball-gt', 64, 64],
    ['dragon-ball-super', 131, 14],
    ['dragon-ball-z-kai', 98, 0],
    ['dragon-ball-z-kai-the-final-chapters', 69, 2],
    ['my-hero-academia', 13, 0],
    ['my-hero-academia-season-3', 25, 2],
    ['my-hero-academia-final-season', 11, 0],
    ['jujutsu-kaisen-season-3', 12, 0],
    ['demon-slayer-hashira-training-arc', 8, 0],
    ['attack-on-titan-the-final-chapters', 2, 0],
    ['inuyasha', 167, 35],
    ['inuyasha-the-final-act', 26, 0],
    ['yu-yu-hakusho', 112, 0],
    ['rurouni-kenshin', 94, 38],
    ['gintama', 201, 21],
    ['gintama-silver-soul-arc-second-half', 14, 0],
  ])('%s has %i episodes and %i filler', (slug, total, filler) => {
    const d = bySlug[slug];
    expect(d).toBeDefined();
    expect(d.episodes).toHaveLength(total);
    expect(d.episodes.filter((e) => e.type === 'FILLER')).toHaveLength(filler);
    expect(d.episodes.map((e) => e.number)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  });

  it.each([
    // franchise, seasons, total episodes, filler (published totals for the whole show)
    ['My Hero Academia', 8, 170, 4],
    ['Attack on Titan', 7, 89, 0],
    ['Demon Slayer', 5, 63, 0],
    ['Jujutsu Kaisen', 3, 59, 0],
    ['Gintama', 8, 367, 23],
    ['Inuyasha', 2, 193, 35],
    ['Dragon Ball Z Kai', 2, 167, 2],
    ['Fairy Tail', 3, 328, 61],
  ])('%s has %i seasons, %i episodes and %i filler', (franchise, seasons, total, filler) => {
    const members = datasets.filter((d) => d.franchise === franchise).sort((a, b) => (a.franchiseOrder ?? 0) - (b.franchiseOrder ?? 0));
    expect(members).toHaveLength(seasons);
    expect(members.map((m) => m.franchiseOrder)).toEqual(Array.from({ length: seasons }, (_, i) => i + 1));
    expect(members.reduce((n, m) => n + m.episodes.length, 0)).toBe(total);
    expect(members.reduce((n, m) => n + m.episodes.filter((e) => e.type === 'FILLER').length, 0)).toBe(filler);
  });

  it('uses unique AniList IDs and matches the committed catalog', () => {
    expect(new Set(datasets.map((d) => d.anilistId)).size).toBe(datasets.length);
    const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'data', 'index.json'), 'utf8'));
    expect(validateCatalog(catalog, datasets)).toEqual([]);
    expect(buildCatalog(datasets).anime).toHaveLength(datasets.length);
  });

  it('round-trip through the serializer unchanged', () => {
    for (const d of datasets) expect(JSON.parse(serializeDataset(d))).toEqual(d);
  });

  it('encode to a strip that decodes back to the same types', () => {
    for (const d of datasets) {
      const decoded = decodeStrip(encodeStrip(d.episodes));
      expect(decoded.map((e) => e.type), d.slug).toEqual([...d.episodes].sort((a, b) => a.number - b.number).map((e) => e.type));
    }
  });
});
