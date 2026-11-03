import { detectRuns, evidenceTier } from '../src/engine/arc.js';
import { applyCalibration, finalConfidence, fitCalibration, fitCurve, UNCALIBRATED_CAP, type Calibration } from '../src/engine/calibration.js';
import { decide } from '../src/engine/decision.js';
import { HybridEngine } from '../src/engine/hybrid.js';
import { computePrior, detectEpisodeTags, ruleAccuracy, ruleSkill } from '../src/engine/learning.js';
import { evaluateRules, matchesCondition } from '../src/engine/rules.js';
import { buildTagPatterns } from '../src/engine/tags.js';
import { computeSeriesProfile } from '../src/engine/series.js';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import { CATEGORY_LABELS } from '../src/domain/types.js';
import { SEED_RULES, SEED_TAG_DETECTORS } from '../src/domain/seedData.js';
import { ruleConditionSchema } from '../src/domain/rules.js';
import { buildEmbeddingDocument, cosine, documentHash, HashingEmbedder } from '../src/embedding/embedder.js';
import { anime, episode, FakeEvidence, labeled, labels, rule } from './helpers.js';

const embedder = new HashingEmbedder();
const thresholds = DEFAULT_SETTINGS.thresholds;
/** A calibration curve that believes the raw score, so tests can see the bands. */
const identity: Calibration = {
  version: 'identity',
  tiers: Object.fromEntries(
    (['bracketed', 'adjacent', 'series', 'none'] as const).map((t) => [t, { knots: [[0, 0], [1, 1]] }]),
  ),
};

function engineWith(setup: (e: FakeEvidence) => void = () => undefined) {
  const evidence = new FakeEvidence();
  evidence.knowledge.calibration = identity;
  setup(evidence);
  return new HybridEngine(evidence, embedder);
}

describe('confidence bands', () => {
  it.each([
    [0.95, 'AUTO_APPROVED'],
    [0.91, 'AUTO_APPROVED'],
    [0.9, 'SUGGESTED'],
    [0.7, 'SUGGESTED'],
    [0.69, 'NEEDS_REVIEW'],
    [0.2, 'NEEDS_REVIEW'],
  ] as const)('%d is %s', (confidence, expected) => {
    expect(decide(confidence, thresholds)).toBe(expected);
  });

  it('compares the percentage shown, so a displayed 90 is never auto-approved', () => {
    expect(decide(0.9049, thresholds)).toBe('SUGGESTED');
  });
});

describe('rule conditions', () => {
  const facts = { anime: anime({ source: 'MANGA', genres: ['Action', 'Comedy'], totalEpisodes: 200 }), episode: episode(5, { title: 'Summer at the BEACH', tags: ['beach'] }) };

  it('matches case-insensitively across scalars and lists', () => {
    expect(matchesCondition({ field: 'anime.source', in: ['manga'] }, facts)).toBe(true);
    expect(matchesCondition({ field: 'anime.genres', in: ['comedy'] }, facts)).toBe(true);
    expect(matchesCondition({ field: 'episode.title', matches: 'beach' }, facts)).toBe(true);
    expect(matchesCondition({ field: 'anime.source', in: ['ORIGINAL'] }, facts)).toBe(false);
  });

  it('compares numbers and combines conditions', () => {
    expect(matchesCondition({ field: 'anime.totalEpisodes', gte: 100 }, facts)).toBe(true);
    expect(matchesCondition({ field: 'episode.number', lte: 4 }, facts)).toBe(false);
    expect(matchesCondition({ all: [{ field: 'anime.source', in: ['MANGA'] }, { not: { field: 'episode.number', lte: 4 } }] }, facts)).toBe(true);
    expect(matchesCondition({ any: [{ field: 'episode.number', lte: 4 }, { field: 'episode.tags', in: ['nope'] }] }, facts)).toBe(false);
  });

  it('treats a missing value as no match rather than an error', () => {
    const blank = { anime: anime({ source: null }), episode: episode(1, { title: null }) };
    expect(matchesCondition({ field: 'anime.source', in: ['MANGA'] }, blank)).toBe(false);
    expect(matchesCondition({ field: 'episode.title', matches: '.' }, blank)).toBe(false);
  });

  it('rejects malformed conditions and invalid patterns at the boundary', () => {
    expect(ruleConditionSchema.safeParse({ field: 'episode.title', matches: '(' }).success).toBe(false);
    expect(ruleConditionSchema.safeParse({ field: 'nope', in: ['x'] }).success).toBe(false);
    expect(ruleConditionSchema.safeParse({ all: [] }).success).toBe(false);
    for (const seed of SEED_RULES) expect(ruleConditionSchema.safeParse(seed.condition).success).toBe(true);
  });

  it('skips disabled rules and scales points by learned skill', () => {
    const hits = evaluateRules(
      [rule({ id: 1, skill: 0.5 }), rule({ id: 2, enabled: false })],
      { anime: anime(), episode: episode(1, { tags: ['beach'] }) },
    );
    expect(hits.map((h) => h.ruleId)).toEqual([1]);
    expect(hits[0]!.scoreValue).toBe(30);
    expect(hits[0]!.appliedScore).toBe(15);
  });
});

describe('rule skill', () => {
  it('gives no credit for only matching the base rate', () => {
    const counts = { highFires: 0, highCorrect: 0, mediumFires: 4000, mediumCorrect: 2800 };
    expect(ruleAccuracy(counts)).toBeCloseTo(0.7, 1);
    expect(ruleSkill(counts, 0.7)).toBeLessThan(0.01);
  });

  it('rewards a rare target that turns out to be right', () => {
    expect(ruleSkill({ highFires: 20, highCorrect: 18, mediumFires: 0, mediumCorrect: 0 }, 0.05)).toBeGreaterThan(0.8);
  });

  it('counts a human decision for more than a curated label', () => {
    const human = ruleAccuracy({ highFires: 10, highCorrect: 0, mediumFires: 0, mediumCorrect: 0 });
    const curated = ruleAccuracy({ highFires: 0, highCorrect: 0, mediumFires: 10, mediumCorrect: 0 });
    expect(human).toBeLessThan(curated);
  });
});

describe('seed tag detectors, checked against false positives found in the real data', () => {
  const detectors = SEED_TAG_DETECTORS.map((d) => ({ ...d, enabled: true }));
  const tagsOf = (title: string) => detectEpisodeTags(detectors, { title, description: null, arc: null });

  it.each([
    ['Retrospective', 'recap'],
    ['The Story So Far', 'recap'],
    ['Special Episode: Save the World With Love!', 'special-episode'],
    ['Shinigami at War! New Year in Seireitei Special!', 'special-episode'],
    ['A Day at the Beach', 'beach'],
    ['The Tournament Begins', 'tournament'],
  ])('%s has %s', (title, tag) => {
    expect(tagsOf(title)).toContain(tag);
  });

  it.each([
    ['So Close Yet So Far', 'recap'],
    ['Piccolo Vs. Frost - Put It All on the Special Beam Cannon!', 'special-episode'],
    ['Is there a Special Move?', 'special-episode'],
    ['Formation of Special Fire Force Company 8', 'special-episode'],
  ])('%s does not have %s', (title, tag) => {
    expect(tagsOf(title)).not.toContain(tag);
  });
});

describe('arc detection', () => {
  const settings = DEFAULT_SETTINGS;

  it('segments runs with start, end, category and confidence', () => {
    const runs = detectRuns(labels('C10 F5 C4'), settings);
    expect(runs.map((r) => [r.startEpisode, r.endEpisode, r.category, r.kind])).toEqual([
      [1, 10, 'CANON', 'CANON_RUN'],
      [11, 15, 'FILLER', 'FILLER_RUN'],
      [16, 19, 'CANON', 'CANON_RUN'],
    ]);
    expect(runs[0]!.confidence).toBeGreaterThan(0);
  });

  it('labels anime-original and mixed runs', () => {
    expect(detectRuns(labels('A4 M3'), settings).map((r) => r.kind)).toEqual(['ANIME_ORIGINAL_ARC', 'MIXED_RUN']);
  });

  it('keeps a one-episode interruption inside an established run, at lower confidence', () => {
    const pure = detectRuns(labels('C9'), settings)[0]!;
    const interrupted = detectRuns(labels('C4 M1 C4'), settings);
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]!.endEpisode).toBe(9);
    expect(interrupted[0]!.confidence).toBeLessThan(pure.confidence);
  });

  it('does not bridge a gap of unknown episodes', () => {
    expect(detectRuns(labels('C3 _10 C3'), settings)).toHaveLength(2);
  });

  it('rates a run of unreviewed predictions below the same run of reviewed episodes', () => {
    const low = detectRuns(labels('F6', 'LOW'), settings)[0]!;
    const high = detectRuns(labels('F6', 'HIGH'), settings)[0]!;
    expect(low.confidence).toBeLessThan(high.confidence / 5);
  });

  it('reports a majority arc name but ignores the no-arc placeholder', () => {
    const named = labels('C4').map((e) => ({ ...e, arc: 'Chunin Exams' }));
    const placeholder = labels('C4').map((e) => ({ ...e, arc: 'Standalone Episodes' }));
    expect(detectRuns(named, settings)[0]!.name).toBe('Chunin Exams');
    expect(detectRuns(placeholder, settings)[0]!.name).toBeNull();
  });
});

describe('evidence tiers', () => {
  const tier = (neighbours: ReturnType<typeof labels>, number = 11, related = false) =>
    evidenceTier({ number }, neighbours, related, DEFAULT_SETTINGS);

  it('reflects how close trusted labels are', () => {
    expect(tier(labels('C10 _1 C5'))).toBe('bracketed');
    expect(tier(labels('C10'))).toBe('adjacent');
    expect(tier(labels('C2'))).toBe('series');
    expect(tier([])).toBe('none');
    expect(tier([], 11, true)).toBe('series');
  });

  it("is never lifted by the system's own predictions", () => {
    expect(tier(labels('C10 _1 C5', 'LOW'))).toBe('none');
  });
});

describe('calibration', () => {
  it('produces a non-decreasing curve', () => {
    const samples = Array.from({ length: 2000 }, (_, i) => ({ score: i / 2000, correct: (i * 7919) % 100 < i / 20 }));
    const { knots } = fitCurve(samples);
    for (let i = 1; i < knots.length; i++) expect(knots[i]![1]).toBeGreaterThanOrEqual(knots[i - 1]![1]);
  });

  it('keeps tiers apart, so the same score can mean different things', () => {
    const mk = (tier: 'bracketed' | 'none', correctRate: number) =>
      Array.from({ length: 500 }, (_, i) => ({ score: 0.8, correct: i < 500 * correctRate, tier }));
    const fitted = fitCalibration([...mk('bracketed', 0.95), ...mk('none', 0.5)], 'v');
    expect(applyCalibration(fitted, 'bracketed', 0.8)).toBeGreaterThan(0.9);
    expect(applyCalibration(fitted, 'none', 0.8)).toBeLessThan(0.6);
  });

  it('holds tiers without nearby trusted labels below auto-approval, however good the curve looks', () => {
    const generous: Calibration = { version: 'x', tiers: { series: { knots: [[0, 0.99], [1, 0.99]] }, adjacent: { knots: [[0, 0.99], [1, 0.99]] } } };
    const series = finalConfidence(generous, 'series', 0.9, DEFAULT_SETTINGS);
    expect(series).toBe(0.9);
    expect(decide(series, thresholds)).toBe('SUGGESTED');
    expect(decide(finalConfidence(generous, 'adjacent', 0.9, DEFAULT_SETTINGS), thresholds)).toBe('AUTO_APPROVED');
  });

  it('never auto-approves on a score with no track record', () => {
    expect(applyCalibration(null, 'bracketed', 0.999)).toBe(UNCALIBRATED_CAP);
    expect(decide(applyCalibration({ version: 'x', tiers: {} }, 'none', 1), thresholds)).not.toBe('AUTO_APPROVED');
  });
});

describe('hybrid engine', () => {
  it('lets a decisive format fact settle OVA, Special and Movie, and says why', async () => {
    const engine = engineWith((e) => {
      e.rules = [rule({ decisive: true, targetCategory: 'MOVIE', scoreValue: 100, condition: { field: 'anime.format', in: ['MOVIE'] }, explanation: 'AniList lists this as a movie' })];
      e.neighbours = labels('C20');
    });
    const result = await engine.classifyEpisode({ anime: anime({ format: 'MOVIE' }), episode: episode(1) });
    expect(result.category).toBe('MOVIE');
    expect(result.decision).toBe('AUTO_APPROVED');
    expect(result.reasons).toEqual(['AniList lists this as a movie']);
  });

  it('follows the surrounding run when an episode sits inside a filler arc', async () => {
    const engine = engineWith((e) => {
      e.neighbours = labels('C149 F7 _1 F7 C20');
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(157) });
    expect(result.category).toBe('FILLER');
    expect(result.evidenceTier).toBe('bracketed');
    expect(result.reasons.join(' ')).toMatch(/Located inside Filler run/);
  });

  it('marks a run made only of unreviewed predictions, and leaves reviewed ones unmarked', async () => {
    const reasonsFor = async (trust: 'LOW' | 'HIGH') =>
      (await engineWith((e) => (e.neighbours = labels('C30 _1 C30', trust))).classifyEpisode({ anime: anime(), episode: episode(31) })).reasons.join(' ');
    expect(await reasonsFor('LOW')).toMatch(/Located inside Canon run.*unreviewed predictions so far/);
    expect(await reasonsFor('HIGH')).not.toMatch(/unreviewed/);
  });

  it('follows the surrounding run for a canon episode too', async () => {
    const engine = engineWith((e) => {
      e.neighbours = labels('C114 _1 C5');
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(115) });
    expect(result.category).toBe('CANON');
    expect(result.reasons.join(' ')).toMatch(/Located inside Canon run/);
  });

  it('falls back near the base rate with low confidence when it knows nothing', async () => {
    const result = await engineWith().classifyEpisode({ anime: anime(), episode: episode(1, { title: null }) });
    expect(result.evidenceTier).toBe('none');
    expect(result.category).toBe('CANON');
    expect(result.confidence).toBeLessThan(0.75);
    expect(result.reasons).toEqual(['Little evidence available; prediction follows the global base rate']);
  });

  it('adjusts confidence to the series, not just the catalog', async () => {
    const profile = computeSeriesProfile(1, labels('F80 C20'), DEFAULT_SETTINGS);
    const filler = await engineWith((e) => (e.profile = profile)).classifyEpisode({ anime: anime(), episode: episode(200) });
    const plain = await engineWith().classifyEpisode({ anime: anime(), episode: episode(200) });
    expect(filler.distribution.FILLER).toBeGreaterThan(plain.distribution.FILLER);
    expect(filler.reasons.join(' ')).toMatch(/Series profile indicates \d+% Filler/);
  });

  it('borrows a related season for a brand new series, and says it did', async () => {
    const parent = computeSeriesProfile(2, labels('F50', 'MEDIUM', 2), DEFAULT_SETTINGS);
    const engine = engineWith((e) => e.profiles.set(2, parent));
    const result = await engine.classifyEpisode({ anime: anime({ relatedAnimeIds: [2] }), episode: episode(1) });
    expect(result.distribution.FILLER).toBeGreaterThan(0.25);
    expect(result.evidenceTier).toBe('series');
    expect(result.reasons.join(' ')).toMatch(/Related seasons/);
  });

  it('explains the similar episodes that influenced it', async () => {
    const engine = engineWith((e) => {
      e.similar = [
        { episode: labeled(118, 'CANON', 'HIGH'), animeTitle: 'Test Show', similarity: 0.92 },
        { episode: labeled(40, 'CANON', 'MEDIUM', 9), animeTitle: 'Other Show', similarity: 0.74 },
      ];
    });
    const { similarEpisodes, reasons } = await engine.classifyEpisode({ anime: anime(), episode: episode(123) });
    expect(similarEpisodes[0]).toMatchObject({ episode: 118, classification: 'CANON', similarity: 0.92, trust: 'HIGH' });
    expect(similarEpisodes[0]!.selectedBecause).toMatch(/92% similar; same series; human-reviewed/);
    expect(similarEpisodes[1]!.selectedBecause).toMatch(/from Other Show; curated label/);
    expect(reasons.join(' ')).toMatch(/Matched 1 previously reviewed Canon episode/);
  });

  it('shows dissent instead of hiding it', async () => {
    const engine = engineWith((e) => {
      e.neighbours = labels('C30 _1 C30');
      e.rules = [rule({ targetCategory: 'FILLER', scoreValue: 1, explanation: 'Title suggests a beach episode' })];
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(31, { tags: ['beach'] }) });
    expect(result.category).toBe('CANON');
    expect(result.reasons).toContain('Against: Title suggests a beach episode');
  });

  it('keeps its explanation consistent: no reason contradicts the side it is listed on', async () => {
    const tagPatterns = buildTagPatterns(
      [
        { anime: anime({ id: 8, tags: [{ name: 'Adoption', rank: 90 }] }), episodes: Array.from({ length: 40 }, () => ({ category: 'ANIME_CANON' as const, trust: 'HIGH' as const, tags: [] })) },
        { anime: anime({ id: 9, tags: [{ name: 'Shounen', rank: 90 }] }), episodes: Array.from({ length: 400 }, () => ({ category: 'CANON' as const, trust: 'HIGH' as const, tags: [] })) },
      ],
      DEFAULT_SETTINGS,
    );
    const engine = engineWith((e) => {
      e.knowledge.tagPatterns = tagPatterns;
    });
    const result = await engine.classifyEpisode({
      anime: anime({ tags: [{ name: 'Shounen', rank: 90 }, { name: 'Adoption', rank: 70 }] }),
      episode: episode(1),
    });
    const tags = result.contributors.find((c) => c.name === 'tags')!;
    for (const reason of tags.reasons) expect(reason).toContain(CATEGORY_LABELS[tags.topCategory]);
  });

  it("doesn't offer a rule that barely moved the result as a reason, but still records it", async () => {
    const manga = SEED_RULES.find((r) => r.ruleName === 'Manga Adaptation')!;
    const engine = engineWith((e) => {
      e.rules = [rule({ ...manga, id: 9, skill: 0.004, decisive: false })];
      e.neighbours = labels('C10 _1 C10');
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(11) });
    expect(result.reasons.join(' ')).not.toMatch(/Adapted from a manga/);
    expect(result.supportingRules.map((r) => r.ruleName)).toEqual(['Manga Adaptation']);
  });

  it('accounts for the result: shares of evidence add up, and every contributor is reported', async () => {
    const engine = engineWith((e) => {
      e.neighbours = labels('C30 _1 C30');
      e.profile = computeSeriesProfile(1, labels('C60'), DEFAULT_SETTINGS);
    });
    const { contributors } = await engine.classifyEpisode({ anime: anime(), episode: episode(31) });
    expect(contributors.map((c) => c.name).sort()).toEqual(['arc', 'rules', 'series', 'similarity', 'tags']);
    expect(contributors.reduce((sum, c) => sum + Math.abs(c.share), 0)).toBeCloseTo(1, 1);
    expect(contributors.find((c) => c.name === 'arc')!.share).toBeGreaterThan(0.3);
  });

  it('makes a recap a Special even in the middle of a canon arc, using the seeded rule', async () => {
    const recap = SEED_RULES.find((r) => r.ruleName === 'Recap')!;
    const engine = engineWith((e) => {
      e.rules = [rule({ ...recap, id: 9, skill: 0.75, decisive: false })];
      e.neighbours = labels('C30 _1 C30');
      e.profile = computeSeriesProfile(1, e.neighbours, DEFAULT_SETTINGS);
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(31, { title: 'Recap', tags: ['recap'] }) });
    expect(result.category).toBe('SPECIAL');
    expect(result.reasons[0]).toBe('Title suggests a recap episode');
  });

  it('does not let a weak title rule overturn a strong run', async () => {
    const beach = SEED_RULES.find((r) => r.ruleName === 'Beach Episode')!;
    const engine = engineWith((e) => {
      e.rules = [rule({ ...beach, id: 9, skill: 0.14, decisive: false })];
      e.neighbours = labels('C30 _1 C30');
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(31, { tags: ['beach'] }) });
    expect(result.category).toBe('CANON');
  });
});

describe('anti-drift', () => {
  it('keeps predictions without trusted evidence out of auto-approval, even when they all agree', async () => {
    const curve: Calibration = {
      version: 'real-shape',
      tiers: { none: { knots: [[0.2, 0.3], [1, 0.75]] }, series: { knots: [[0.2, 0.3], [1, 0.8]] }, adjacent: { knots: [[0.2, 0.5], [1, 0.97]] }, bracketed: { knots: [[0.2, 0.5], [1, 0.97]] } },
    };
    const evidence = new FakeEvidence();
    evidence.knowledge.calibration = curve;
    evidence.neighbours = labels('F200', 'LOW');
    evidence.profile = computeSeriesProfile(1, evidence.neighbours, DEFAULT_SETTINGS);
    const result = await new HybridEngine(evidence, embedder).classifyEpisode({ anime: anime(), episode: episode(201) });
    expect(result.evidenceTier).toBe('none');
    expect(result.decision).not.toBe('AUTO_APPROVED');
  });

  it("doesn't let a related season of unreviewed predictions vouch for this one", async () => {
    const parent = computeSeriesProfile(2, labels('F50', 'LOW', 2), DEFAULT_SETTINGS);
    const engine = engineWith((e) => e.profiles.set(2, parent));
    const result = await engine.classifyEpisode({ anime: anime({ relatedAnimeIds: [2] }), episode: episode(1) });
    expect(result.evidenceTier).toBe('none');
  });

  it('lets a few reviewed episodes outvote many unreviewed predictions', async () => {
    const reviewed = [labeled(100, 'CANON', 'HIGH'), labeled(101, 'CANON', 'HIGH'), labeled(103, 'CANON', 'HIGH'), labeled(104, 'CANON', 'HIGH')];
    const poison = [...Array(6).keys()].flatMap((i) => [labeled(90 + i, 'FILLER', 'LOW'), labeled(110 + i, 'FILLER', 'LOW')]);
    const engine = engineWith((e) => {
      e.neighbours = [...poison, ...reviewed];
    });
    const result = await engine.classifyEpisode({ anime: anime(), episode: episode(102) });
    expect(result.category).toBe('CANON');
  });

  it('leaves unreviewed predictions out of learned tag patterns', () => {
    const patterns = buildTagPatterns(
      [
        {
          anime: anime(),
          episodes: [
            { category: 'FILLER', trust: 'LOW', tags: ['beach'] },
            { category: 'CANON', trust: 'HIGH', tags: ['beach'] },
          ],
        },
      ],
      DEFAULT_SETTINGS,
    );
    expect(patterns.get('episode|beach')!.counts).toEqual({ CANON: 1 });
  });

  it('weights a profile by trust, so predictions barely move it', () => {
    const profile = computeSeriesProfile(1, [...labels('F90', 'LOW'), ...labels('C10', 'HIGH')], DEFAULT_SETTINGS);
    expect(profile.distribution.CANON).toBeGreaterThan(0.5);
  });
});

describe('prior', () => {
  it('keeps categories without labels reachable', () => {
    const prior = computePrior({ CANON: 7000, FILLER: 2000 });
    expect(prior.MOVIE).toBeGreaterThan(0);
    expect(prior.CANON).toBeGreaterThan(0.7);
  });
});

describe('embeddings', () => {
  it('produces deterministic unit vectors of the column size', () => {
    const a = embedder.embedSync(buildEmbeddingDocument(anime(), episode(1)));
    const b = embedder.embedSync(buildEmbeddingDocument(anime(), episode(1)));
    expect(a).toHaveLength(384);
    expect(a).toEqual(b);
    expect(cosine(a, a)).toBeCloseTo(1, 5);
  });

  it('ranks shared wording above unrelated text', () => {
    const doc = (title: string) => embedder.embedSync(buildEmbeddingDocument(anime(), episode(1, { title })));
    const query = doc('The Great Ninja Tournament Begins');
    expect(cosine(query, doc('The Ninja Tournament Final'))).toBeGreaterThan(cosine(query, doc('A Quiet Afternoon Picnic')));
  });

  it('notices when inputs change, and when the model does', () => {
    const doc = buildEmbeddingDocument(anime(), episode(1));
    expect(documentHash(doc, 'm')).toBe(documentHash(buildEmbeddingDocument(anime(), episode(1)), 'm'));
    expect(documentHash(doc, 'm')).not.toBe(documentHash(doc, 'other'));
    expect(documentHash(doc, 'm')).not.toBe(documentHash(buildEmbeddingDocument(anime(), episode(1, { title: 'New' })), 'm'));
  });
});
