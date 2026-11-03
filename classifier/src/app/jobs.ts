import type { Database, Queryable } from '../db/database.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';

export type JobKind = 'IMPORT_ANIME' | 'RECLASSIFY_SERIES';

export interface Job {
  id: number;
  kind: JobKind;
  anime_id: number;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  attempts: number;
  error: string | null;
  result: unknown;
  requested_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const MAX_ATTEMPTS = 5;
/** A RUNNING job older than this belongs to a worker that died. */
const STUCK_AFTER_MINUTES = 30;

export class JobQueue {
  /** A second request while one is pending returns the pending job: the unique index collapses bursts. */
  async enqueue(db: Queryable, kind: JobKind, animeId: number, requestedBy?: string): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO jobs (kind, anime_id, requested_by) VALUES ($1, $2, $3)
       ON CONFLICT (kind, anime_id) WHERE status = 'PENDING' DO UPDATE SET requested_by = jobs.requested_by
       RETURNING id`,
      [kind, animeId, requestedBy ?? null],
    );
    return rows[0]!.id;
  }

  async get(db: Queryable, id: number): Promise<Job | null> {
    const { rows } = await db.query<Job>('SELECT * FROM jobs WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  /** SKIP LOCKED lets any number of workers share the queue without taking the same job. */
  async claim(db: Queryable): Promise<Job | null> {
    await db.query(
      `UPDATE jobs SET status = 'PENDING', run_after = now(), error = 'worker lost'
       WHERE id IN (
         SELECT DISTINCT ON (kind, anime_id) id FROM jobs j
         WHERE status = 'RUNNING' AND started_at < now() - ($1 || ' minutes')::interval
           AND NOT EXISTS (SELECT 1 FROM jobs p WHERE p.kind = j.kind AND p.anime_id = j.anime_id AND p.status = 'PENDING')
         ORDER BY kind, anime_id, id
       )`,
      [String(STUCK_AFTER_MINUTES)],
    );
    const { rows } = await db.query<Job>(
      `UPDATE jobs SET status = 'RUNNING', attempts = attempts + 1, started_at = now()
       WHERE id = (
         SELECT id FROM jobs WHERE status = 'PENDING' AND run_after <= now()
         ORDER BY run_after, id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       RETURNING *`,
    );
    return rows[0] ?? null;
  }

  async complete(db: Queryable, id: number, result: unknown): Promise<void> {
    await db.query(`UPDATE jobs SET status = 'DONE', result = $2::jsonb, error = NULL, finished_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(result ?? null),
    ]);
  }

  /** Backs off exponentially, then gives up. Returns whether it will retry. */
  async fail(db: Queryable, job: Job, error: Error, retryAfterSeconds?: number, permanent = false): Promise<boolean> {
    if (permanent || job.attempts >= MAX_ATTEMPTS) {
      await db.query(`UPDATE jobs SET status = 'FAILED', error = $2, finished_at = now() WHERE id = $1`, [job.id, error.message]);
      return false;
    }
    const delay = retryAfterSeconds ?? 30 * 2 ** job.attempts;
    // If an identical job was queued meanwhile, that one will do the work.
    const { rows } = await db.query(`SELECT 1 FROM jobs WHERE kind = $1 AND anime_id = $2 AND status = 'PENDING'`, [job.kind, job.anime_id]);
    if (rows.length > 0) {
      await db.query(`UPDATE jobs SET status = 'FAILED', error = $2, finished_at = now() WHERE id = $1`, [job.id, error.message]);
      return true;
    }
    await db.query(
      `UPDATE jobs SET status = 'PENDING', error = $2, run_after = now() + ($3 || ' seconds')::interval WHERE id = $1`,
      [job.id, error.message, String(delay)],
    );
    return true;
  }
}

export type JobHandler = (job: Job) => Promise<unknown>;

export class Worker {
  private running = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Database,
    private readonly queue: JobQueue,
    private readonly handlers: Record<JobKind, JobHandler>,
    private readonly metrics: Metrics,
    private readonly log: Logger,
    private readonly pollMs = 2_000,
  ) {}

  /** Runs one job if there is one. Returns false when the queue is empty. */
  async runOnce(): Promise<boolean> {
    const job = await this.queue.claim(this.db);
    if (!job) return false;
    try {
      const result = await this.handlers[job.kind](job);
      await this.queue.complete(this.db, job.id, result);
      this.metrics.job(job.kind, 'done');
      this.log.info({ jobId: job.id, kind: job.kind, animeId: job.anime_id, result }, 'job done');
    } catch (error) {
      const { retryAfterSeconds, kind } = error as { retryAfterSeconds?: number; kind?: string };
      // An ID AniList doesn't have will never appear by retrying.
      const retrying = await this.queue.fail(this.db, job, error as Error, retryAfterSeconds, kind === 'not-found');
      this.metrics.job(job.kind, retrying ? 'retry' : 'failed');
      this.log.error({ jobId: job.id, kind: job.kind, animeId: job.anime_id, err: error, retrying }, 'job failed');
    }
    return true;
  }

  async drain(): Promise<void> {
    while (await this.runOnce());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.idle = (async () => {
      while (this.running) {
        const worked = await this.runOnce().catch((error: unknown) => {
          this.log.error({ err: error }, 'worker loop error');
          return false;
        });
        if (!worked && this.running) await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
    })();
  }

  /** Lets the job in progress finish. */
  async stop(): Promise<void> {
    this.running = false;
    await this.idle;
  }
}
