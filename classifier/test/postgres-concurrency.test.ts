import { persistPrediction } from '../src/app/classification.js';
import type { Container } from '../src/container.js';
import { createPostgres, migrate, toVectorLiteral, type Database } from '../src/db/database.js';
import { emptyDistribution } from '../src/domain/types.js';
import type { Prediction } from '../src/engine/classifier.js';
import { anime, freshPostgresUrl, seedSeries, testContainer, TEST_POSTGRES_URL } from './helpers.js';

/**
 * What only a real server can show: PGlite is one connection, so it never truly races. Needs a Postgres with
 * pgvector: TEST_POSTGRES_URL=postgres://postgres:test@localhost:55432/postgres npm test
 */
describe.skipIf(!TEST_POSTGRES_URL)('real Postgres concurrency', () => {
  it('lets several processes start at once on an empty database', async () => {
    const { url, drop } = await freshPostgresUrl();
    const clients: Database[] = Array.from({ length: 6 }, () => createPostgres(url, 2));
    try {
      const results = await Promise.allSettled(clients.map((db) => migrate(db)));
      expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
      const applied = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      expect(applied).toEqual(['001_init.sql']);
    } finally {
      await Promise.all(clients.map((db) => db.close()));
      await drop();
    }
  });

  it('finds as many cross-series candidates as it asks for', async () => {
    const c = await testContainer();
    try {
      const count = 200;
      await seedSeries(c, anime({ id: 5 }), Array.from({ length: count }, (_, i) => ({ number: i + 1, title: `Battle chapter number ${i}`, category: 'CANON' as const })));
      const query = new Float32Array(384);
      query[0] = 1;
      // A table this small would normally be scanned, which hides the limit. Force the index.
      const { hits, plan } = await c.db.tx(async (tx) => {
        await tx.query('SET LOCAL enable_seqscan = off');
        const sql = `SELECT episode_id FROM episode_embeddings WHERE trust_level IN ('HIGH', 'MEDIUM') ORDER BY embedding <=> '${toVectorLiteral(query)}'::vector LIMIT 60`;
        return { hits: await tx.query(sql), plan: await tx.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`) };
      });
      expect(plan.rows.map((r) => r['QUERY PLAN']).join(' ')).toContain('episode_embeddings_trusted_hnsw_idx');
      expect(hits.rows).toHaveLength(60);
    } finally {
      await c.close();
    }
  });

  describe('against a seeded service', () => {
    let c: Container;
    let ids: Map<number, number>;

    beforeEach(async () => {
      c = await testContainer();
      ids = await seedSeries(c, anime({ id: 1 }), [
        ...Array.from({ length: 10 }, (_, i) => ({ number: i + 1, category: 'CANON' as const })),
        { number: 11, category: null },
      ]);
      await c.classification.classifySeries(1);
    });
    afterEach(() => c.close());

    it('never gives the same job to two workers', async () => {
      for (let animeId = 100; animeId < 120; animeId++) await c.jobs.enqueue(c.db, 'IMPORT_ANIME', animeId);
      const claims = await Promise.all(Array.from({ length: 40 }, () => c.jobs.claim(c.db)));
      const claimed = claims.filter((j) => j !== null).map((j) => j.id);
      expect(claimed).toHaveLength(20);
      expect(new Set(claimed).size).toBe(20);
    });

    it('lets only one of two simultaneous reviewers win when both saw the same version', async () => {
      const id = ids.get(11)!;
      const { rows } = await c.db.query<{ current_classification_id: number }>('SELECT current_classification_id FROM episodes WHERE id = $1', [id]);
      const seen = rows[0]!.current_classification_id;
      const results = await Promise.allSettled([
        c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'FILLER', reason: 'a', reviewer: 'alex', expectedClassificationId: seen }),
        c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'MIXED', reason: 'b', reviewer: 'sam', expectedClassificationId: seen }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: 'conflict' });
      const { rows: audit } = await c.db.query('SELECT id FROM review_audit_log WHERE episode_id = $1', [id]);
      expect(audit).toHaveLength(1);
    });

    it('keeps learned counts exact under simultaneous reviews of different episodes', async () => {
      await c.db.query(`INSERT INTO episode_tags (episode_id, tag, source) SELECT id, 'beach', 'manual' FROM episodes WHERE anime_id = 1`);
      await c.db.tx((tx) => c.learning.rebuildAll(tx));
      const targets = Array.from({ length: 10 }, (_, i) => ids.get(i + 1)!);
      await Promise.all(targets.map((episodeId) => c.review.review({ episodeId, action: 'OVERRIDE', category: 'FILLER', reason: 'x', reviewer: 'alex' })));

      const snapshot = async () => ({
        patterns: (await c.db.query('SELECT scope, tag, category, round(weight::numeric, 3) AS weight FROM tag_patterns WHERE abs(weight) > 0.001 ORDER BY 1,2,3')).rows,
        counts: (await c.db.query('SELECT category, count FROM category_counts WHERE count <> 0 ORDER BY 1')).rows,
        rules: (await c.db.query('SELECT rule_name, high_fires, high_correct, medium_fires, medium_correct FROM classification_rules ORDER BY id')).rows,
      });
      const incremental = await snapshot();
      await c.db.tx((tx) => c.learning.rebuildAll(tx));
      expect(incremental).toEqual(await snapshot());
    });

    it('drops an engine result that arrives after a reviewer got there first', async () => {
      const id = ids.get(11)!;
      await c.review.review({ episodeId: id, action: 'OVERRIDE', category: 'FILLER', reason: 'x', reviewer: 'alex' });
      const late: Prediction = {
        category: 'CANON',
        confidence: 0.99,
        rawScore: 0.99,
        evidenceTier: 'bracketed',
        decision: 'AUTO_APPROVED',
        distribution: emptyDistribution(),
        reasons: [],
        contributors: [],
        supportingRules: [],
        similarEpisodes: [],
        arc: null,
        engine: { name: 'hybrid', version: 'x' },
      };
      expect(await c.db.tx((tx) => persistPrediction(tx, id, late, 'h'))).toBeNull();
      const { rows } = await c.db.query<{ category: string }>('SELECT category FROM episodes WHERE id = $1', [id]);
      expect(rows[0]!.category).toBe('FILLER');
    });
  });
});
