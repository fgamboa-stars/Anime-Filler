import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface QueryResult<Row> {
  rows: Row[];
}

export interface Queryable {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
}

export interface Transaction extends Queryable {
  /** Runs several statements with no parameters. For migrations. */
  exec(sql: string): Promise<void>;
}

/** Thin port over Postgres, so tests run the same SQL on in-process PGlite. */
export interface Database extends Transaction {
  tx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * pgvector's index returns at most ef_search rows whatever the LIMIT says, and the default of 40 is below the
 * 60 candidates cross-series search asks for. Nothing errors: the results are just quietly short.
 */
const EF_SEARCH = 100;

export function createPostgres(connectionString: string, poolSize = 10): Database {
  const pool = new pg.Pool({ connectionString, max: poolSize, options: `-c hnsw.ef_search=${EF_SEARCH}` });
  // Without a listener, an error on an idle client would crash the process.
  pool.on('error', (error) => console.error('postgres pool error', error));

  return {
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (sql, params) => client.query(sql, params as unknown[]) as never,
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

/** In-process Postgres with pgvector. For tests and local development. Pass a directory to persist it. */
export async function createPGlite(dataDir?: string): Promise<Database> {
  const [{ PGlite }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/vector'),
  ]);
  const db = await PGlite.create({ dataDir, extensions: { vector } });
  await db.exec(`SET hnsw.ef_search = ${EF_SEARCH}`);

  return {
    query: (sql, params) => db.query(sql, params as unknown[]) as never,
    tx: (fn) =>
      db.transaction((tx) =>
        fn({
          query: (sql, params) => tx.query(sql, params as unknown[]) as never,
          exec: async (sql) => {
            await tx.exec(sql);
          },
        }),
      ) as never,
    async exec(sql) {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

export async function createDatabase(url: string): Promise<Database> {
  if (url === 'pglite:memory') return createPGlite();
  if (url.startsWith('pglite:')) return createPGlite(url.slice('pglite:'.length));
  return createPostgres(url);
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/** Any fixed number works, as long as every process uses the same one. */
const MIGRATION_LOCK = 7_268_301;

/**
 * Applies pending migrations in filename order, all or nothing. The API and workers all start at once, so the
 * advisory lock makes the others wait for whichever got there first, then find nothing left to do.
 */
export async function migrate(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  return db.tx(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`);
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await tx.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const applied: string[] = [];

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      try {
        await tx.exec(readFileSync(join(dir, file), 'utf8'));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    }
    return applied;
  });
}

export function toVectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector, (v) => (Number.isFinite(v) ? Number(v.toFixed(6)) : 0)).join(',')}]`;
}
