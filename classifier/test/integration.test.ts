import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Container } from '../src/container.js';
import { exportDataset } from '../src/app/export.js';
import { monthlyStats } from '../src/app/stats.js';
import { loadRules, loadTagPatterns } from '../src/db/knowledge.js';
import { emptyDistribution, type Category } from '../src/domain/types.js';
import { HybridEngine } from '../src/engine/hybrid.js';
import type { ClassifierEngine } from '../src/engine/classifier.js';
import { TokenAuthenticator } from '../src/http/auth.js';
import { buildServer } from '../src/http/server.js';
import { anime, fakeAniList, rawMedia, seedSeries, testContainer } from './helpers.js';

const ADMIN = 'admin-token-0123456789';
const READER = 'reader-token-0123456789';
const auth = new TokenAuthenticator(`alex:admin:${ADMIN},site:reader:${READER}`);
const asAdmin = { authorization: `Bearer ${ADMIN}` };
const asReader = { authorization: `Bearer ${READER}` };

function range(from: number, to: number, category: Category | null) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ number: from + i, category }));
}

/** A labelled series with a filler arc, plus unlabelled gaps for the engine to fill. */
async function seedFillerArc(c: Container, id = 1) {
  return seedSeries(c, anime({ id, title: `Show ${id}`, totalEpisodes: 60 }), [
    ...range(1, 20, 'CANON'),
    ...range(21, 24, 'FILLER'),
    { number: 25, category: null },
    ...range(26, 30, 'FILLER'),
    ...range(31, 40, 'CANON'),
    { number: 41, category: null },
    ...range(42, 50, 'CANON'),
  ]);
}

async function row(c: Container, id: number) {
  const { rows } = await c.db.query<Record<string, any>>('SELECT * FROM episodes WHERE id = $1', [id]);
  return rows[0]!;
}

describe('schema guarantees', () => {
  let c: Container;
  beforeAll(async () => {
    c = await testContainer();
  });
  afterAll(() => c.close());

  it('stores every rule in the database, none in code paths', async () => {
    const rules = await loadRules(c.db);
    expect(rules.map((r) => r.ruleName)).toEqual(expect.arrayContaining(['Manga Adaptation', 'Anime Original', 'Beach Episode', 'Tournament Arc', 'Recap', 'Original Character']));
    expect(rules.find((r) => r.ruleName === 'Beach Episode')).toMatchObject({ targetCategory: 'FILLER', scoreValue: 15, enabled: true });
  });

  it('applies migrations only once', async () => {
    const { migrate } = await import('../src/db/database.js');
    expect(await migrate(c.db)).toEqual([]);
  });

  it('uses indexes built for the lookups that matter', async () => {
    const { rows } = await c.db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(['episode_embeddings_trusted_hnsw_idx', 'episode_tags_tag_idx', 'arc_profiles_lookup_idx', 'episodes_review_queue_idx', 'episodes_anime_id_number_key']),
    );
  });

  it('refuses to let anything but a human change a reviewed episode, even in raw SQL', async () => {
    const ids = await seedSeries(c, anime({ id: 7 }), [{ number: 1, category: null }]);
    const id = ids.get(1)!;
    await c.classification.classifySeries(7);
    await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'FILLER', reason: 'Checked against the manga', reviewer: 'alex' });

    await expect(c.db.query(`UPDATE episodes SET category = 'CANON' WHERE id = $1`, [id])).rejects.toThrow(/human review/);
    const { rows } = await c.db.query<{ id: number }>(
      `INSERT INTO classification_history (episode_id, category, confidence, origin, trust_level) VALUES ($1,'CANON',0.9,'engine','LOW') RETURNING id`,
      [id],
    );
    await expect(c.db.query('UPDATE episodes SET current_classification_id = $2 WHERE id = $1', [id, rows[0]!.id])).rejects.toThrow(/human review/);
    expect((await row(c, id)).category).toBe('FILLER');
  });

  it('keeps the audit trail and history append-only', async () => {
    await expect(c.db.query('DELETE FROM review_audit_log')).rejects.toThrow(/append-only/);
    await expect(c.db.query(`UPDATE review_audit_log SET reviewer = 'someone else'`)).rejects.toThrow(/append-only/);
    await expect(c.db.query('DELETE FROM classification_history')).rejects.toThrow(/append-only/);
  });
});

describe('classifying a series', () => {
  let c: Container;
  let ids: Map<number, number>;
  beforeAll(async () => {
    c = await testContainer();
    ids = await seedFillerArc(c);
    await c.classification.classifySeries(1);
  });
  afterAll(() => c.close());

  it('reads the surrounding arc through real SQL evidence', async () => {
    const inFiller = await row(c, ids.get(25)!);
    expect(inFiller.category).toBe('FILLER');
    expect(inFiller.origin).toBe('engine');
    expect(inFiller.trust_level).toBe('LOW');
    expect((await row(c, ids.get(41)!)).category).toBe('CANON');
  });

  it('never replaces curated labels', async () => {
    expect(await row(c, ids.get(21)!)).toMatchObject({ category: 'FILLER', origin: 'import', trust_level: 'MEDIUM' });
  });

  it('stores the full trace: scores, rules and similar episodes', async () => {
    const episode = await row(c, ids.get(25)!);
    const { rows: scores } = await c.db.query<{ contributor: string }>('SELECT contributor FROM prediction_scores WHERE classification_id = $1', [episode.current_classification_id]);
    expect(scores.map((s) => s.contributor).sort()).toEqual(['arc', 'rules', 'series', 'similarity', 'tags']);
    const { rows: history } = await c.db.query<{ reasons: string[]; similar_episodes: unknown[]; evidence_tier: string }>('SELECT * FROM classification_history WHERE id = $1', [episode.current_classification_id]);
    expect(history[0]!.reasons.join(' ')).toMatch(/Filler/);
    expect(history[0]!.similar_episodes.length).toBeGreaterThan(0);
    expect(history[0]!.evidence_tier).toBe('bracketed');
  });

  it('caches decisions when nothing relevant changed, without touching history', async () => {
    const before = (await c.db.query<{ n: number }>('SELECT count(*)::int AS n FROM classification_history')).rows[0]!.n;
    const again = await c.classification.classifySeries(1);
    expect(again).toMatchObject({ classified: 0, cached: 2 });
    expect((await c.db.query<{ n: number }>('SELECT count(*)::int AS n FROM classification_history')).rows[0]!.n).toBe(before);
  });

  it('builds a series profile and arc profile', async () => {
    const { rows: profiles } = await c.db.query<Record<string, any>>('SELECT * FROM series_profiles WHERE anime_id = 1');
    expect(profiles[0]!.canon_percentage).toBeGreaterThan(70);
    expect(profiles[0]!.filler_percentage).toBeGreaterThan(10);
    const { rows: arcs } = await c.db.query<Record<string, any>>('SELECT * FROM arc_profiles WHERE anime_id = 1 ORDER BY start_episode');
    expect(arcs.map((a) => [a.start_episode, a.end_episode, a.category])).toEqual([
      [1, 20, 'CANON'],
      [21, 30, 'FILLER'],
      [31, 50, 'CANON'],
    ]);
  });
});

describe('human review and continuous learning', () => {
  let c: Container;
  let ids: Map<number, number>;
  beforeEach(async () => {
    c = await testContainer();
    ids = await seedFillerArc(c);
    await c.classification.classifySeries(1);
  });
  afterEach(() => c.close());

  it('records an override with everything the audit log needs', async () => {
    const id = ids.get(25)!;
    const before = await row(c, id);
    await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'MIXED', reason: 'Half adapts chapter 40', reviewer: 'alex' });

    const { rows } = await c.db.query<Record<string, any>>('SELECT * FROM review_audit_log WHERE episode_id = $1', [id]);
    expect(rows[0]).toMatchObject({
      action: 'OVERRIDE',
      original_prediction: before.category,
      new_classification: 'MIXED',
      reason: 'Half adapts chapter 40',
      reviewer: 'alex',
      original_origin: 'engine',
    });
    expect(rows[0]!.created_at).toBeInstanceOf(Date);
    expect(await row(c, id)).toMatchObject({ category: 'MIXED', trust_level: 'HIGH', review_status: 'OVERRIDDEN', origin: 'human' });
  });

  it('promotes a reviewed episode to a high-trust example, searchable across series', async () => {
    const id = ids.get(25)!;
    const { rows: low } = await c.db.query<{ trust_level: string }>('SELECT trust_level FROM episode_embeddings WHERE episode_id = $1', [id]);
    expect(low[0]!.trust_level).toBe('LOW');
    await c.review.review({ episodeId: id, action: 'APPROVE', reviewer: 'alex' });
    const { rows: high } = await c.db.query<{ trust_level: string }>('SELECT trust_level FROM episode_embeddings WHERE episode_id = $1', [id]);
    expect(high[0]!.trust_level).toBe('HIGH');
  });

  it('never lets re-classification overwrite a reviewed episode', async () => {
    const id = ids.get(25)!;
    await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'CANON', reason: 'Actually canon', reviewer: 'alex' });
    await c.worker.drain();
    const result = await c.classification.classifySeries(1);
    expect(result.skippedProtected).toBeGreaterThan(0);
    expect(await row(c, id)).toMatchObject({ category: 'CANON', review_status: 'OVERRIDDEN' });
  });

  it('validates review commands', async () => {
    const id = ids.get(25)!;
    await expect(c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'CANON', reviewer: 'alex' })).rejects.toThrow(/reason/);
    await expect(c.review.review({ episodeId: id, action: 'OVERRIDE', reason: 'x', reviewer: 'alex' })).rejects.toThrow(/category/);
    await expect(c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'FILLER', reason: 'x', reviewer: 'alex' })).rejects.toThrow(/already/);
    await expect(c.review.review({ episodeId: id, action: 'APPROVE', category: 'CANON', reviewer: 'alex' })).rejects.toThrow(/OVERRIDE/);
    await expect(c.review.review({ episodeId: 999_999, action: 'APPROVE', reviewer: 'alex' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('detects a reviewer working from a stale page', async () => {
    const id = ids.get(25)!;
    const seen = (await row(c, id)).current_classification_id;
    await c.review.review({ episodeId: id, action: 'APPROVE', reviewer: 'sam', expectedClassificationId: seen });
    await expect(c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'CANON', reason: 'x', reviewer: 'alex', expectedClassificationId: seen })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rolls back everything when learning fails mid-review', async () => {
    const id = ids.get(25)!;
    const broken = c.learning.applyReview;
    c.learning.applyReview = async () => {
      throw new Error('boom');
    };
    await expect(c.review.review({ episodeId: id, action: 'APPROVE', reviewer: 'alex' })).rejects.toThrow('boom');
    c.learning.applyReview = broken;
    expect((await c.db.query<{ n: number }>('SELECT count(*)::int AS n FROM review_audit_log')).rows[0]!.n).toBe(0);
    expect((await row(c, id)).review_status).toBe('UNREVIEWED');
  });

  it('updates the pattern database, series profile, rule stats and accuracy from one review', async () => {
    const id = ids.get(25)!;
    await c.db.query(`INSERT INTO episode_tags (episode_id, tag, source) VALUES ($1, 'beach', 'manual')`, [id]);
    const patternsBefore = await loadTagPatterns(c.db);
    const beachBefore = patternsBefore.get('episode|beach')?.counts.FILLER ?? 0;

    await c.review.review({ episodeId: id, action: 'APPROVE', reviewer: 'alex' });

    expect((await loadTagPatterns(c.db)).get('episode|beach')!.counts.FILLER).toBe(beachBefore + 1);
    const rule = (await loadRules(c.db)).find((r) => r.ruleName === 'Beach Episode')!;
    const { rows } = await c.db.query<{ high_fires: number; high_correct: number }>('SELECT high_fires, high_correct FROM classification_rules WHERE id = $1', [rule.id]);
    expect(rows[0]).toEqual({ high_fires: 1, high_correct: 1 });
    const { rows: profile } = await c.db.query<Record<string, any>>('SELECT * FROM series_profiles WHERE anime_id = 1');
    expect(profile[0]).toMatchObject({ reviewed_predictions: 1, correct_predictions: 1, historical_accuracy: 1 });
  });

  it('never double counts when a human corrects a human, and matches a full rebuild', async () => {
    const id = ids.get(25)!;
    const other = ids.get(41)!;
    await c.db.query(`INSERT INTO episode_tags (episode_id, tag, source) VALUES ($1, 'beach', 'manual')`, [id]);
    await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'CANON', reason: 'first pass', reviewer: 'alex' });
    await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'FILLER', reason: 'looked again', reviewer: 'sam' });
    await c.review.review({ episodeId: other, action: 'APPROVE', reviewer: 'sam' });
    // An imported label gets corrected too.
    await c.review.review({ episodeId: ids.get(30)!, action: 'OVERRIDE', category: 'MIXED', reason: 'partly canon', reviewer: 'sam' });

    const snapshot = async () => ({
      patterns: (await c.db.query('SELECT scope, tag, category, round(weight::numeric, 3) AS weight FROM tag_patterns WHERE abs(weight) > 0.001 ORDER BY 1,2,3')).rows,
      counts: (await c.db.query('SELECT category, count FROM category_counts WHERE count <> 0 ORDER BY 1')).rows,
      rules: (await c.db.query('SELECT rule_name, high_fires, high_correct, medium_fires, medium_correct FROM classification_rules ORDER BY id')).rows,
      arcs: (await c.db.query('SELECT anime_id, start_episode, end_episode, category FROM arc_profiles ORDER BY 1,2')).rows,
      profiles: (await c.db.query('SELECT anime_id, labeled_count, reviewed_predictions, correct_predictions FROM series_profiles ORDER BY 1')).rows,
    });
    const incremental = await snapshot();
    await c.db.tx((tx) => c.learning.rebuildAll(tx));
    expect(incremental).toEqual(await snapshot());
  });

  it('feeds a review back: correcting one episode changes predictions next to it', async () => {
    const meta = anime({ id: 2, title: 'Fresh Show', totalEpisodes: 12 });
    const fresh = await seedSeries(c, meta, [
      ...range(1, 4, 'CANON'),
      { number: 5, category: null },
      { number: 6, category: null },
    ]);
    await c.classification.classifySeries(2);
    const trace = async () => {
      const episode = await row(c, fresh.get(6)!);
      const { rows } = await c.db.query<{ distribution: Record<Category, number>; reasons: string[] }>(
        'SELECT distribution, reasons FROM classification_history WHERE id = $1',
        [episode.current_classification_id],
      );
      return { episode, ...rows[0]! };
    };
    const before = await trace();
    expect(before.episode.category).toBe('CANON');

    await c.review.review({ episodeId: fresh.get(5)!, action: 'OVERRIDE', category: 'FILLER', reason: 'A filler arc starts here', reviewer: 'alex' });
    await c.worker.drain();

    const { rows } = await c.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'RECLASSIFY_SERIES' AND status = 'DONE'`);
    expect(rows[0]!.n).toBeGreaterThan(0);
    const after = await trace();
    expect(after.episode.current_classification_id).not.toBe(before.episode.current_classification_id);
    expect(after.distribution.FILLER).toBeGreaterThan(before.distribution.FILLER * 10);
    expect(after.episode.confidence).toBeLessThan(before.episode.confidence);
  });

  it('refreshes a stored explanation when the evidence changes, even if the label and confidence do not', async () => {
    const meta = anime({ id: 2, title: 'Fresh Show', totalEpisodes: 12 });
    const fresh = await seedSeries(c, meta, [...range(1, 30, 'CANON'), { number: 31, category: null }, ...range(32, 40, 'CANON')]);
    await c.classification.classifySeries(2);
    const id = fresh.get(31)!;
    const before = (await row(c, id)).current_classification_id;
    // Confidence is capped without a calibration curve, so the number stays put while the evidence shifts.
    await c.review.review({ episodeId: fresh.get(29)!, action: 'OVERRIDE', category: 'MIXED', reason: 'Partly canon', reviewer: 'alex' });
    await c.worker.drain();
    const after = await row(c, id);
    expect(after.category).toBe('CANON');
    expect(after.current_classification_id).not.toBe(before);
    const { rows } = await c.db.query<{ reasons: string[] }>('SELECT reasons FROM classification_history WHERE id = $1', [after.current_classification_id]);
    expect(rows[0]!.reasons.join(' ')).toMatch(/episodes 3[0-9]-40|Canon run/);
  });

  it('says so when a run or profile is only the engine talking to itself', async () => {
    const meta = anime({ id: 2, title: 'Fresh Show', totalEpisodes: 12 });
    const fresh = await seedSeries(c, meta, range(1, 8, null));
    await c.classification.classifySeries(2);
    await c.classification.classifySeries(2);
    const { rows } = await c.db.query<{ reasons: string[]; evidence_tier: string }>(
      'SELECT h.reasons, h.evidence_tier FROM episodes e JOIN classification_history h ON h.id = e.current_classification_id WHERE e.id = $1',
      [fresh.get(8)!],
    );
    expect(rows[0]!.evidence_tier).toBe('none');
    const reasons = rows[0]!.reasons.join(' ');
    expect(reasons).toMatch(/unreviewed predictions so far/);
    expect(reasons).not.toMatch(/Series profile indicates/);
  });

  it('produces monthly statistics from the logs', async () => {
    await c.review.review({ episodeId: ids.get(25)!, action: 'APPROVE', reviewer: 'alex' });
    await c.review.review({ episodeId: ids.get(41)!, action: 'OVERRIDE', category: 'MIXED', reason: 'partly canon', reviewer: 'sam' });

    const stats = await monthlyStats(c.db, new Date().toISOString().slice(0, 7));
    expect(stats.reviews).toEqual({ total: 2, approvals: 1, overrides: 1 });
    expect(stats.predictionAccuracy).toEqual({ reviewed: 2, correct: 1, accuracy: 0.5 });
    expect(stats.corrections).toEqual(expect.arrayContaining([{ reviewer: 'sam', reviews: 1, overrides: 1 }]));
    expect(stats.commonCorrections).toEqual([{ from: 'CANON', to: 'MIXED', count: 1 }]);
    expect(stats.seriesAccuracy[0]).toMatchObject({ animeId: 1, reviewed: 2, correct: 1 });
    expect(stats.contributorAccuracy.map((x) => x.contributor)).toContain('arc');
    expect(stats.ruleAccuracy).toBeInstanceOf(Array);

    const empty = await monthlyStats(c.db, '2001-01');
    expect(empty.reviews.total).toBe(0);
    expect(empty.predictionAccuracy.accuracy).toBeNull();
  });
});

describe('anti-drift through the database', () => {
  let c: Container;
  beforeAll(async () => {
    c = await testContainer();
  });
  afterAll(() => c.close());

  it("keeps a series' unreviewed predictions out of another series' similar episodes", async () => {
    const shared = 'The Great Ninja Tournament Final Battle';
    await seedSeries(c, anime({ id: 10, title: 'Predicted Show' }), [{ number: 1, title: shared, category: null }]);
    await c.classification.classifySeries(10);
    await seedSeries(c, anime({ id: 11, title: 'Curated Show' }), [{ number: 1, title: shared, category: 'CANON' }]);
    await seedSeries(c, anime({ id: 12, title: 'New Show' }), [{ number: 1, title: shared, category: null }]);
    await c.classification.classifySeries(12);

    const { rows } = await c.db.query<{ similar_episodes: Array<{ animeId: number }> }>(
      `SELECT h.similar_episodes FROM classification_history h JOIN episodes e ON e.id = h.episode_id WHERE e.anime_id = 12`,
    );
    const seen = rows[0]!.similar_episodes.map((s) => s.animeId);
    expect(seen).toContain(11);
    expect(seen).not.toContain(10);
  });

  it('does not count predictions toward learned patterns or the prior', async () => {
    const { rows } = await c.db.query<{ total: number }>('SELECT COALESCE(sum(count), 0)::int AS total FROM category_counts');
    expect(rows[0]!.total).toBe(1);
  });
});

describe('importing from AniList', () => {
  let c: Container;
  let anilist: ReturnType<typeof fakeAniList>;
  beforeAll(async () => {
    anilist = fakeAniList({ 500: rawMedia(), 600: rawMedia({ id: 600, format: 'OVA', title: { romaji: 'An OVA', english: null }, episodes: 2, streamingEpisodes: [] }) });
    c = await testContainer({ anilist: anilist.client });
  });
  afterAll(() => c.close());

  it('imports metadata and episodes, then classifies them', async () => {
    const result = await c.importer.importAnime(500);
    expect(result).toMatchObject({ title: 'Fake Show', newEpisodes: 6, classified: 6 });
    const { rows } = await c.db.query<Record<string, any>>('SELECT number, title, category, decision, trust_level FROM episodes WHERE anime_id = 500 ORDER BY number');
    expect(rows).toHaveLength(6);
    expect(rows[2]!.title).toBe('Beach Episode');
    expect(rows.every((r) => r.category && r.trust_level === 'LOW')).toBe(true);
    // Nothing to vouch for these yet: a person has to look before they can be published.
    expect(rows.every((r) => r.decision !== 'AUTO_APPROVED')).toBe(true);
  });

  it('detects episode tags on the way in', async () => {
    const { rows } = await c.db.query<{ tag: string; number: number }>(
      `SELECT t.tag, e.number FROM episode_tags t JOIN episodes e ON e.id = t.episode_id WHERE e.anime_id = 500 ORDER BY e.number`,
    );
    expect(rows).toEqual(expect.arrayContaining([{ tag: 'beach', number: 3 }, { tag: 'recap', number: 4 }]));
  });

  it('classifies an OVA by its AniList format, with reasons', async () => {
    await c.importer.importAnime(600);
    const { rows } = await c.db.query<Record<string, any>>('SELECT category, decision FROM episodes WHERE anime_id = 600');
    expect(rows.every((r) => r.category === 'OVA' && r.decision === 'AUTO_APPROVED')).toBe(true);
  });

  it('is idempotent: re-importing adds nothing and costs no new prediction', async () => {
    const result = await c.importer.importAnime(500);
    expect(result).toMatchObject({ newEpisodes: 0, classified: 0, cached: 6 });
  });

  it('keeps a known title when AniList later omits it', async () => {
    const { client } = fakeAniList({ 500: rawMedia({ streamingEpisodes: [] }) });
    const { AniListImporter } = await import('../src/app/importer.js');
    await new AniListImporter(c.db, client, c.classification).importAnime(500);
    const { rows } = await c.db.query<{ title: string }>('SELECT title FROM episodes WHERE anime_id = 500 AND number = 1');
    expect(rows[0]!.title).toBe('The Beginning');
  });

  it('caches AniList responses in Postgres across clients', async () => {
    const { AniListClient } = await import('../src/anilist/client.js');
    const { PostgresAniListCache } = await import('../src/app/importer.js');
    const cache = new PostgresAniListCache(c.db);
    let fetches = 0;
    const client = new AniListClient({
      cache,
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => {
        fetches += 1;
        return new Response(JSON.stringify({ data: { Media: rawMedia({ id: 700 }) } }), { status: 200 });
      }) as typeof fetch,
    });
    await client.getAnimeWithEpisodes(700);
    await client.getAnimeWithEpisodes(700);
    expect(fetches).toBe(1);
  });
});

describe('job queue', () => {
  let c: Container;
  beforeEach(async () => {
    c = await testContainer();
  });
  afterEach(() => c.close());

  it('collapses repeat requests into one pending job', async () => {
    const a = await c.jobs.enqueue(c.db, 'RECLASSIFY_SERIES', 1);
    const b = await c.jobs.enqueue(c.db, 'RECLASSIFY_SERIES', 1);
    const other = await c.jobs.enqueue(c.db, 'RECLASSIFY_SERIES', 2);
    expect(a).toBe(b);
    expect(other).not.toBe(a);
  });

  it('retries with backoff, then fails for good', async () => {
    const id = await c.jobs.enqueue(c.db, 'IMPORT_ANIME', 123);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await c.db.query('UPDATE jobs SET run_after = now() WHERE id = $1', [id]);
      const job = await c.jobs.claim(c.db);
      expect(job).toMatchObject({ id, attempts: attempt, status: 'RUNNING' });
      expect(await c.jobs.fail(c.db, job!, new Error('nope'))).toBe(attempt < 5);
    }
    expect(await c.jobs.get(c.db, id)).toMatchObject({ status: 'FAILED', error: 'nope' });
    expect(await c.jobs.claim(c.db)).toBeNull();
  });

  it('holds a retried job back until its delay passes', async () => {
    await c.jobs.enqueue(c.db, 'IMPORT_ANIME', 123);
    await c.jobs.fail(c.db, (await c.jobs.claim(c.db))!, new Error('nope'), 3600);
    expect(await c.jobs.claim(c.db)).toBeNull();
  });

  it('recovers a job whose worker died', async () => {
    const id = await c.jobs.enqueue(c.db, 'IMPORT_ANIME', 123);
    await c.jobs.claim(c.db);
    await c.db.query(`UPDATE jobs SET started_at = now() - interval '2 hours' WHERE id = $1`, [id]);
    expect(await c.jobs.claim(c.db)).toMatchObject({ id, attempts: 2 });
  });

  it("doesn't retry an anime AniList doesn't have", async () => {
    const missing = fakeAniList({});
    const withMissing = await testContainer({ anilist: missing.client });
    const id = await withMissing.jobs.enqueue(withMissing.db, 'IMPORT_ANIME', 404);
    await withMissing.worker.runOnce();
    expect(await withMissing.jobs.get(withMissing.db, id)).toMatchObject({ status: 'FAILED', attempts: 1 });
    await withMissing.close();
  });

  it('records a failure without killing the worker', async () => {
    await c.jobs.enqueue(c.db, 'RECLASSIFY_SERIES', 424242);
    expect(await c.worker.runOnce()).toBe(true);
    const { rows } = await c.db.query<Record<string, any>>('SELECT status, error FROM jobs');
    expect(rows[0]).toMatchObject({ status: 'PENDING', error: 'Unknown anime 424242' });
  });
});

describe('HTTP API', () => {
  let c: Container;
  let app: ReturnType<typeof buildServer>;
  let ids: Map<number, number>;
  const anilist = fakeAniList({ 500: rawMedia() });

  beforeAll(async () => {
    c = await testContainer({ anilist: anilist.client });
    ids = await seedFillerArc(c);
    await c.classification.classifySeries(1);
    app = buildServer(c, auth);
  });
  afterAll(async () => {
    await app.close();
    await c.close();
  });

  it('answers health checks without a token', async () => {
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/readyz' })).json()).toMatchObject({ status: 'ready', engine: { name: 'hybrid' } });
  });

  it('locks everything else behind a token, and writes behind the admin role', async () => {
    expect((await app.inject({ url: '/v1/rules' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/rules', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/metrics' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/rules', headers: asReader })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/imports', headers: asReader, payload: { anilistId: 1 } })).statusCode).toBe(403);
  });

  it('fails closed when no tokens are configured', async () => {
    const closed = buildServer(c, new TokenAuthenticator(''));
    expect((await closed.inject({ url: '/v1/rules', headers: asAdmin })).statusCode).toBe(401);
    await closed.close();
  });

  it('rejects weak or malformed token configuration', () => {
    expect(() => new TokenAuthenticator('alex:admin:short')).toThrow(/at least 16/);
    expect(() => new TokenAuthenticator('alex:owner:0123456789abcdef')).toThrow(/admin\|reader/);
  });

  it('returns the documented explanation shape', async () => {
    const response = await app.inject({ url: '/v1/anime/1/episodes/25/classification', headers: asReader });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ episode: 25, prediction: 'Filler', category: 'FILLER', origin: 'engine', trust: 'LOW', review: { status: 'UNREVIEWED', history: [] }, engine: { name: 'hybrid' } });
    expect(typeof body.confidence).toBe('number');
    expect(body.confidence).toBeGreaterThan(1);
    expect(body.reasons.length).toBeGreaterThan(0);
    expect(body.similarEpisodes[0]).toEqual(expect.objectContaining({ episode: expect.any(Number), classification: expect.any(String), similarity: expect.any(Number), selectedBecause: expect.any(String) }));
    expect(body.contributors.map((x: { name: string }) => x.name)).toContain('arc');
  });

  it('classifies a described episode as a dry run, storing nothing', async () => {
    const before = (await c.db.query<{ n: number }>('SELECT count(*)::int AS n FROM classification_history')).rows[0]!.n;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/classify',
      headers: asReader,
      payload: { anilistId: 1, episode: { number: 28, title: 'Vacation at the Beach' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ episode: 28, category: 'FILLER', classificationId: null });
    expect((await c.db.query<{ n: number }>('SELECT count(*)::int AS n FROM classification_history')).rows[0]!.n).toBe(before);
  });

  it('validates input, with useful errors', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/classify', headers: asReader, payload: { anilistId: 'x' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('invalid-request');
    expect((await app.inject({ url: '/v1/anime/1/episodes/9999/classification', headers: asReader })).statusCode).toBe(404);
    expect((await app.inject({ url: '/v1/anime/abc/profile', headers: asReader })).statusCode).toBe(400);
    expect((await app.inject({ url: '/v1/stats/monthly?month=2026-13', headers: asReader })).statusCode).toBe(400);
  });

  it('imports asynchronously through the job queue', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/imports', headers: asAdmin, payload: { anilistId: 500 } });
    expect(created.statusCode).toBe(202);
    const { jobId } = created.json();
    await c.worker.drain();
    const job = (await app.inject({ url: `/v1/jobs/${jobId}`, headers: asReader })).json();
    expect(job).toMatchObject({ status: 'DONE', result: { title: 'Fake Show', newEpisodes: 6 }, requested_by: 'alex' });
  });

  it('runs a review end to end, with the reviewer taken from the token', async () => {
    const queue = (await app.inject({ url: '/v1/review-queue?decision=NEEDS_REVIEW', headers: asReader })).json();
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.items[0]).toHaveProperty('animeTitle');

    const id = ids.get(41)!;
    const spoof = await app.inject({ method: 'POST', url: `/v1/episodes/${id}/review`, headers: asAdmin, payload: { action: 'APPROVE', reviewer: 'someone-else' } });
    expect(spoof.statusCode).toBe(400);

    const reviewed = await app.inject({
      method: 'POST',
      url: `/v1/episodes/${id}/review`,
      headers: asAdmin,
      payload: { action: 'OVERRIDE', category: 'ANIME_CANON', reason: 'Original arc, referenced later' },
    });
    expect(reviewed.statusCode).toBe(200);

    const after = (await app.inject({ url: '/v1/anime/1/episodes/41/classification', headers: asReader })).json();
    expect(after).toMatchObject({ prediction: 'Anime Canon', origin: 'human', trust: 'HIGH', confidence: 100, review: { status: 'OVERRIDDEN' } });
    expect(after.review.history[0]).toMatchObject({ action: 'OVERRIDE', newClassification: 'Anime Canon', reason: 'Original arc, referenced later', reviewer: 'alex' });
    expect(after.review.history[0].timestamp).toEqual(expect.any(String));

    const history = (await app.inject({ url: `/v1/episodes/${id}/history`, headers: asReader })).json();
    expect(history.classifications.map((h: { origin: string }) => h.origin)).toEqual(['human', 'engine']);
  });

  it('lets an admin tag an episode, which rules can then use', async () => {
    const id = ids.get(42)!;
    expect((await app.inject({ method: 'POST', url: `/v1/episodes/${id}/tags`, headers: asReader, payload: { tag: 'anime-original' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/v1/episodes/${id}/tags`, headers: asAdmin, payload: { tag: 'Not Valid!' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/episodes/99999/tags', headers: asAdmin, payload: { tag: 'anime-original' } })).statusCode).toBe(404);
    const tagged = await app.inject({ method: 'POST', url: `/v1/episodes/${id}/tags`, headers: asAdmin, payload: { tag: 'anime-original' } });
    expect(tagged.statusCode).toBe(201);
    const { rows } = await c.db.query('SELECT tag, source FROM episode_tags WHERE episode_id = $1', [id]);
    expect(rows).toEqual([{ tag: 'anime-original', source: 'manual' }]);
    expect((await app.inject({ url: '/v1/anime/1/episodes?tag=anime-original', headers: asReader })).json().episodes).toHaveLength(1);
  });

  it('turns review conflicts into HTTP statuses', async () => {
    const id = ids.get(25)!;
    const stale = await app.inject({ method: 'POST', url: `/v1/episodes/${id}/review`, headers: asAdmin, payload: { action: 'APPROVE', expectedClassificationId: 1 } });
    expect(stale.statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/v1/episodes/99999/review', headers: asAdmin, payload: { action: 'APPROVE' } })).statusCode).toBe(404);
  });

  it('lets an admin edit rules, and changing one invalidates cached decisions', async () => {
    const rules = (await app.inject({ url: '/v1/rules', headers: asReader })).json().rules as Array<{ id: number; ruleName: string; stats: { accuracy: number } }>;
    const beach = rules.find((r) => r.ruleName === 'Beach Episode')!;
    expect(beach.stats.accuracy).toEqual(expect.any(Number));

    const patched = await app.inject({ method: 'PATCH', url: `/v1/rules/${beach.id}`, headers: asAdmin, payload: { scoreValue: 22, enabled: false } });
    expect(patched.json()).toMatchObject({ scoreValue: 22, enabled: false });
    expect((await app.inject({ method: 'PATCH', url: `/v1/rules/${beach.id}`, headers: asAdmin, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/v1/rules/99999', headers: asAdmin, payload: { enabled: true } })).statusCode).toBe(404);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/rules',
      headers: asAdmin,
      payload: { ruleName: 'Clip Show', targetCategory: 'SPECIAL', scoreValue: 40, condition: { field: 'episode.title', matches: '\\bclip show\\b' }, explanation: 'Title calls itself a clip show' },
    });
    expect(created.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/rules',
      headers: asAdmin,
      payload: { ruleName: 'Clip Show', targetCategory: 'SPECIAL', scoreValue: 40, condition: { field: 'episode.title', matches: 'x' }, explanation: 'x' },
    });
    expect(duplicate.statusCode).toBe(409);
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/rules',
      headers: asAdmin,
      payload: { ruleName: 'Bad', targetCategory: 'SPECIAL', scoreValue: 40, condition: { field: 'episode.title', matches: '(' }, explanation: 'x' },
    });
    expect(invalid.statusCode).toBe(400);

    const result = await c.classification.classifySeries(1);
    expect(result.cached).toBe(0);
  });

  it('serves profiles, arcs, episode filters and statistics', async () => {
    expect((await app.inject({ url: '/v1/anime/1/profile', headers: asReader })).json().anime_id).toBe(1);
    const arcs = (await app.inject({ url: '/v1/anime/1/arcs', headers: asReader })).json().arcs as Array<{ category: string }>;
    expect(arcs.some((a) => a.category === 'FILLER')).toBe(true);
    const filler = (await app.inject({ url: '/v1/anime/1/episodes?category=FILLER&limit=3', headers: asReader })).json();
    expect(filler.episodes).toHaveLength(3);
    expect(filler.episodes[0].classification).toBe('Filler');
    const next = (await app.inject({ url: `/v1/anime/1/episodes?category=FILLER&limit=3&after=${filler.next}`, headers: asReader })).json();
    expect(next.episodes[0].episode).toBeGreaterThan(filler.episodes[2].episode);
    expect((await app.inject({ url: '/v1/anime/500/episodes?tag=beach', headers: asReader })).json().episodes).toHaveLength(1);
    expect((await app.inject({ url: '/v1/stats/monthly', headers: asReader })).json().reviews.total).toBeGreaterThan(0);
  });

  it('exposes Prometheus metrics', async () => {
    const response = await app.inject({ url: '/metrics', headers: asReader });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('classifier_classifications_total');
    expect(response.body).toContain('classifier_reviews_total');
    expect(response.body).toContain('classifier_http_request_duration_seconds');
  });
});

describe('swapping the engine', () => {
  it('needs no change to the API, storage or review flow', async () => {
    const stub: ClassifierEngine = {
      name: 'future-model',
      version: '9.0',
      async classifyEpisode({ episode }) {
        const distribution = emptyDistribution();
        distribution.ANIME_CANON = 1;
        return {
          category: 'ANIME_CANON',
          confidence: 0.8,
          rawScore: 0.8,
          evidenceTier: null,
          decision: 'SUGGESTED',
          distribution,
          reasons: [`Model says so for episode ${episode.number}`],
          contributors: [],
          supportingRules: [],
          similarEpisodes: [],
          arc: null,
          engine: { name: 'future-model', version: '9.0' },
        };
      },
    };
    const c = await testContainer({ engineFactory: () => stub });
    const ids = await seedSeries(c, anime({ id: 3 }), [{ number: 1, category: null }]);
    await c.classification.classifySeries(3);
    const app = buildServer(c, auth);

    const body = (await app.inject({ url: '/v1/anime/3/episodes/1/classification', headers: asReader })).json();
    expect(body).toMatchObject({ prediction: 'Anime Canon', confidence: 80, decision: 'SUGGESTED', engine: { name: 'future-model', version: '9.0' }, reasons: ['Model says so for episode 1'] });
    const reviewed = await app.inject({ method: 'POST', url: `/v1/episodes/${ids.get(1)!}/review`, headers: asAdmin, payload: { action: 'APPROVE' } });
    expect(reviewed.statusCode).toBe(200);

    await app.close();
    await c.close();
  });

  it('reports an unknown engine clearly', async () => {
    const { engines } = await import('../src/container.js');
    expect(() => engines.create('nope', {} as never)).toThrow(/Unknown classifier engine "nope"\. Registered: hybrid/);
    expect(HybridEngine.name).toBe('HybridEngine');
  });
});

describe('exporting to the static site', () => {
  it('publishes only labels that passed, in the format the site validates', async () => {
    const c = await testContainer();
    const dir = mkdtempSync(join(tmpdir(), 'classifier-export-'));
    try {
      const ids = await seedSeries(c, anime({ id: 4, title: "Jo's Bizarre Show!" }), [
        { number: 1, title: 'Curated', category: 'CANON', arc: 'First Arc' },
        { number: 2, title: 'Waiting', category: null },
        { number: 3, title: 'Reviewed', category: null },
        { number: 4, title: 'Called a Special', category: null },
      ]);
      await c.classification.classifySeries(4);
      await c.review.review({ episodeId: ids.get(3)!, action: 'OVERRIDE', category: 'FILLER', reason: 'Checked', reviewer: 'alex' });
      await c.review.review({ episodeId: ids.get(4)!, action: 'OVERRIDE', category: 'SPECIAL', reason: 'Checked', reviewer: 'alex' });
      await c.db.query(`UPDATE episodes SET decision = 'SUGGESTED' WHERE id = $1`, [ids.get(2)!]);

      const result = await exportDataset(c.db, 4, dir);
      expect(result).toMatchObject({ slug: 'jos-bizarre-show', published: 2, heldForReview: [2], unsupportedCategory: [4] });

      const written = JSON.parse(readFileSync(result.path!, 'utf8'));
      expect(written).toMatchObject({ schemaVersion: 1, anilistId: 4, totalEpisodes: 2 });
      expect(written.episodes).toEqual([
        { number: 1, title: 'Curated', type: 'CANON', arc: 'First Arc' },
        { number: 3, title: 'Reviewed', type: 'FILLER', arc: 'Standalone Episodes' },
      ]);
      expect(readFileSync(result.path!, 'utf8')).toContain('\n    {"number":1,');

      // The site's own validator. Imported by URL so the site's source stays out of this package's type check.
      const validator = new URL('../../scripts/lib/validate.ts', import.meta.url).href;
      const { validateDataset } = (await import(/* @vite-ignore */ validator)) as { validateDataset: (d: unknown) => string[] };
      expect(validateDataset(written)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await c.close();
    }
  });
});
