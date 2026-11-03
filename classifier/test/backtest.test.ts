import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crossFitCalibration, runBacktest, scoreSamples, type BacktestSample } from '../src/eval/backtest.js';
import { loadCorpus, storyGroups, type CorpusSeries } from '../src/eval/corpus.js';
import { buildReport, renderReport } from '../src/eval/report.js';
import { anime } from './helpers.js';
import type { Category } from '../src/domain/types.js';

function series(id: number, pattern: string, extra: Partial<CorpusSeries> = {}, title = (n: number) => `Episode ${id} number ${n}`): CorpusSeries {
  const names: Record<string, Category> = { C: 'CANON', F: 'FILLER' };
  const episodes = pattern.split('').map((c, i) => ({ number: i + 1, title: title(i + 1), arc: `Arc ${names[c]}`, category: names[c]! }));
  return { anime: anime({ id, title: `Show ${id}`, totalEpisodes: episodes.length }), slug: `show-${id}`, franchise: null, franchiseOrder: null, episodes, ...extra };
}

describe('story groups', () => {
  it('joins seasons by franchise and by AniList relation, and only those', () => {
    const groups = storyGroups([
      series(1, 'CC', { franchise: 'Saga', franchiseOrder: 1 }),
      series(2, 'CC', { franchise: 'Saga', franchiseOrder: 2 }),
      series(3, 'CC', { anime: anime({ id: 3, relatedAnimeIds: [2] }) }),
      series(4, 'CC'),
    ]);
    expect(groups.map((g) => g.map((s) => s.anime.id).sort()).sort()).toEqual([[1, 2, 3], [4]]);
  });
});

describe('the backtest does not leak', () => {
  const corpus = [series(1, 'CCCCCCCCCCFFFFFCCCCC'), series(2, 'CCCCCCCCFFFFCCCC'), series(3, 'CCCCCCCCCCCC')];

  const byKey = (samples: BacktestSample[], mode: string) =>
    new Map(samples.filter((s) => s.mode === mode).map((s) => [`${s.animeId}:${s.number}`, s]));

  /** The defining test: a hidden label must not be able to influence its own prediction. */
  it.each(['cold-start', 'gap-fill', 'sparse-review', 'batch-tail', 'next-episode'] as const)('%s: changing a hidden label changes nothing about its prediction', async (mode) => {
    const base = await runBacktest(corpus, { modes: [mode] });
    const target = base.find((s) => s.animeId === 1)!;
    const flipped = corpus.map((s) =>
      s.anime.id !== 1
        ? s
        : {
            ...s,
            episodes: s.episodes.map((e) => (e.number === target.number ? { ...e, category: (e.category === 'CANON' ? 'FILLER' : 'CANON') as Category } : e)),
          },
    );
    const after = await runBacktest(flipped, { modes: [mode] });
    const a = byKey(base, mode).get(`1:${target.number}`)!;
    const b = byKey(after, mode).get(`1:${target.number}`)!;
    expect(b.predicted).toBe(a.predicted);
    expect(b.rawScore).toBeCloseTo(a.rawScore, 10);
    expect(b.truth).not.toBe(a.truth);
  });

  it('cold-start never sees any label from the same story', async () => {
    const related = [
      series(1, 'FFFFFFFFFF', { franchise: 'Saga', franchiseOrder: 1 }),
      series(2, 'FFFFFFFFFF', { franchise: 'Saga', franchiseOrder: 2 }),
      series(3, 'CCCCCCCCCC'),
    ];
    const samples = await runBacktest(related, { modes: ['cold-start'] });
    const saga = samples.filter((s) => s.animeId === 2);
    expect(saga.every((s) => s.tier === 'none')).toBe(true);
    expect(saga.every((s) => s.predicted === 'CANON')).toBe(true);
  });

  it('new-season uses earlier seasons, never later ones', async () => {
    const related = [
      series(1, 'FFFFFFFFFF', { franchise: 'Saga', franchiseOrder: 1 }),
      series(2, 'CCCCCCCCCC', { franchise: 'Saga', franchiseOrder: 2, anime: anime({ id: 2, relatedAnimeIds: [1, 3], totalEpisodes: 10 }) }),
      series(3, 'FFFFFFFFFF', { franchise: 'Saga', franchiseOrder: 3 }),
      series(4, 'CCCCCCCCCC'),
    ];
    const samples = await runBacktest(related, { modes: ['new-season'] });
    expect(samples.some((s) => s.animeId === 1)).toBe(false);
    expect(samples.filter((s) => s.animeId === 2).length).toBe(10);

    const withoutSequel = await runBacktest([related[0]!, related[1]!, { ...related[2]!, episodes: related[2]!.episodes.map((e) => ({ ...e, category: 'CANON' as Category })) }, related[3]!], { modes: ['new-season'] });
    const a = samples.find((s) => s.animeId === 2 && s.number === 1)!;
    const b = withoutSequel.find((s) => s.animeId === 2 && s.number === 1)!;
    expect(b.rawScore).toBeCloseTo(a.rawScore, 10);
  });
});

describe('scoring', () => {
  const sample = (truth: Category, predicted: Category, rawScore = 0.8): BacktestSample => ({
    mode: 'gap-fill',
    animeId: 1,
    group: 0,
    number: 1,
    truth,
    predicted,
    rawScore,
    tier: 'adjacent',
    decisive: false,
    distribution: {} as never,
  });

  it('compares against the majority baseline', () => {
    const report = scoreSamples('gap-fill', [sample('CANON', 'CANON'), sample('CANON', 'CANON'), sample('FILLER', 'FILLER'), sample('CANON', 'FILLER')], () => 0.5);
    expect(report.accuracy).toBe(0.75);
    expect(report.baselineAccuracy).toBe(0.75);
    expect(report.macroF1).toBeGreaterThan(report.baselineMacroF1);
    expect(report.perClass.FILLER).toMatchObject({ support: 1, precision: 0.5, recall: 1 });
    expect(report.canonSkippedAsFiller).toBe(1);
  });

  it('leaves format-decided episodes out of accuracy', () => {
    const report = scoreSamples('gap-fill', [sample('CANON', 'CANON'), { ...sample('CANON', 'OVA'), decisive: true }], () => 0.5);
    expect(report).toMatchObject({ episodes: 1, decisiveExcluded: 1, accuracy: 1 });
  });

  it('never scores an episode with a calibration curve it helped fit', () => {
    const bad = Array.from({ length: 200 }, () => ({ ...sample('CANON', 'FILLER'), group: 0 }));
    const good = Array.from({ length: 200 }, () => ({ ...sample('CANON', 'CANON'), group: 1 }));
    const calibrated = crossFitCalibration([...bad, ...good]);
    // Group 0 is always wrong, but it's scored by the curve from group 1, which was always right.
    expect(calibrated.get(bad[0]!)!).toBeGreaterThan(0.9);
    expect(calibrated.get(good[0]!)!).toBeLessThan(0.1);
  });
});

describe('the shipped datasets', () => {
  const root = resolve(import.meta.dirname, '..');
  const corpus = loadCorpus(resolve(root, '../src/data/anime'), resolve(root, 'fixtures/anilist-metadata.json'));

  it('all join to AniList metadata', () => {
    expect(corpus.length).toBeGreaterThan(100);
    for (const s of corpus) expect(s.anime.id).toBeGreaterThan(0);
  });

  it('keep beating the base rate, and keep auto-approval trustworthy', async () => {
    const small = corpus.filter((s) => s.episodes.length <= 120);
    const samples = await runBacktest(small, { modes: ['gap-fill'] });
    const report = buildReport(samples, small.length, 'test');
    const mode = report.modes.find((m) => m.mode === 'gap-fill')!;
    expect(mode.accuracy).toBeGreaterThan(mode.baselineAccuracy);
    expect(mode.macroF1).toBeGreaterThan(mode.baselineMacroF1 + 0.2);
    expect(mode.bands.AUTO_APPROVED.accuracy).toBeGreaterThan(0.9);
    expect(renderReport(report)).toContain('Backtest results');
  });

  it('ship a calibration fitted by the backtest', () => {
    const calibration = JSON.parse(readFileSync(resolve(root, 'fixtures/calibration.json'), 'utf8'));
    expect(Object.keys(calibration.tiers).sort()).toEqual(['adjacent', 'bracketed', 'none', 'series']);
  });
});
