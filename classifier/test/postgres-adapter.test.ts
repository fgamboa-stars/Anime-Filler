import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPostgres, migrate, toVectorLiteral, type Database } from '../src/db/database.js';
import { JobQueue } from '../src/app/jobs.js';
import { seedConfiguration, loadRules } from '../src/db/knowledge.js';

/**
 * Production uses the `pg` driver, not PGlite. This drives that adapter over the real Postgres wire protocol
 * to catch what only appears there: parameter encoding, array and JSON handling, transactions on a checked-out client.
 */
describe('pg driver adapter', () => {
  const PORT = 54_329;
  let pglite: PGlite;
  let server: PGLiteSocketServer;
  let db: Database;

  beforeAll(async () => {
    pglite = await PGlite.create({ extensions: { vector } });
    server = new PGLiteSocketServer({ db: pglite, port: PORT, host: '127.0.0.1' });
    await server.start();
    // The socket server takes one connection at a time.
    db = createPostgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`, 1);
  });

  afterAll(async () => {
    await db.close();
    await server.stop();
    await pglite.close();
  });

  it('runs the migrations and seeds configuration', async () => {
    expect(await migrate(db)).toEqual(['001_init.sql']);
    await seedConfiguration(db);
    const rules = await loadRules(db);
    expect(rules.length).toBeGreaterThan(5);
    // JSONB must come back parsed, not as a string.
    expect(rules[0]!.condition).toEqual(expect.objectContaining({ field: 'anime.format' }));
    expect(rules[0]!.lastUpdated).toBeInstanceOf(Date);
  });

  it('commits a transaction, and rolls back when it throws', async () => {
    await db.tx((tx) => tx.query(`INSERT INTO anime (id, title, genres) VALUES (1, 'Kept', $1)`, [['Action', 'Drama']]));
    await expect(
      db.tx(async (tx) => {
        await tx.query(`INSERT INTO anime (id, title) VALUES (2, 'Rolled back')`);
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');

    const { rows } = await db.query<{ id: number; genres: string[] }>('SELECT id, genres FROM anime ORDER BY id');
    expect(rows).toEqual([{ id: 1, genres: ['Action', 'Drama'] }]);
  });

  it('stores and searches vectors', async () => {
    const { rows } = await db.query<{ id: number }>(`INSERT INTO episodes (anime_id, number, content_hash) VALUES (1, 1, 'x') RETURNING id`);
    const unit = new Float32Array(384);
    unit[0] = 1;
    await db.query(
      `INSERT INTO episode_embeddings (episode_id, model, content_hash, anime_id, trust_level, embedding)
       VALUES ($1, 'm', 'h', 1, 'HIGH', $2::vector)`,
      [rows[0]!.id, toVectorLiteral(unit)],
    );
    const found = await db.query<{ similarity: number }>(
      `SELECT 1 - (embedding <=> $1::vector) AS similarity FROM episode_embeddings WHERE trust_level IN ('HIGH', 'MEDIUM') ORDER BY embedding <=> $1::vector LIMIT 1`,
      [toVectorLiteral(unit)],
    );
    expect(found.rows[0]!.similarity).toBeCloseTo(1, 5);
  });

  it('claims jobs through the same queue SQL', async () => {
    const queue = new JobQueue();
    const id = await queue.enqueue(db, 'IMPORT_ANIME', 1, 'tester');
    expect(await queue.claim(db)).toMatchObject({ id, status: 'RUNNING', attempts: 1 });
    await queue.complete(db, id, { ok: true });
    expect(await queue.get(db, id)).toMatchObject({ status: 'DONE', result: { ok: true } });
  });
});
