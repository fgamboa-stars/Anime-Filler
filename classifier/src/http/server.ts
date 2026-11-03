import Fastify, { type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { AniListError } from '../anilist/client.js';
import { getAnime, type EpisodeRow } from '../app/catalog.js';
import { ReviewError } from '../app/review.js';
import { monthlyStats } from '../app/stats.js';
import type { Container } from '../container.js';
import { toRule } from '../db/knowledge.js';
import { categorySchema, ruleConditionSchema } from '../domain/rules.js';
import { CATEGORY_LABELS } from '../domain/types.js';
import { ruleAccuracy, type RuleOutcomeCounts } from '../engine/learning.js';
import type { Principal, Role, TokenAuthenticator } from './auth.js';
import { loadClassification, loadReviewHistory, predictionToResponse } from './contract.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
  interface FastifyContextConfig {
    /** Minimum role. Absent means the route is public. */
    role?: Role;
  }
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const idParam = z.object({ id: z.coerce.number().int().positive() });
const episodeParams = z.object({ animeId: z.coerce.number().int().positive(), number: z.coerce.number().int().min(0) });
const animeParams = z.object({ animeId: z.coerce.number().int().positive() });
const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Keyset pagination: pass the last id from the previous page. Stays fast deep into a large table. */
  after: z.coerce.number().int().min(0).default(0),
};

const importBody = z.object({ anilistId: z.number().int().positive() }).strict();
const classifyBody = z
  .object({
    anilistId: z.number().int().positive(),
    episode: z
      .object({
        number: z.number().int().min(0),
        title: z.string().max(500).nullable().default(null),
        description: z.string().max(10_000).nullable().default(null),
        arc: z.string().max(200).nullable().default(null),
        tags: z.array(z.string().max(60)).max(50).default([]),
      })
      .strict(),
  })
  .strict();
const reviewBody = z
  .object({
    action: z.enum(['APPROVE', 'OVERRIDE']),
    category: categorySchema.optional(),
    reason: z.string().trim().max(2_000).optional(),
    expectedClassificationId: z.number().int().positive().optional(),
  })
  .strict();
const tagBody = z.object({ tag: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'tags are lowercase-kebab-case').max(60) }).strict();
const ruleBody = z
  .object({
    ruleName: z.string().trim().min(1).max(100),
    targetCategory: categorySchema,
    scoreValue: z.number().min(-100).max(100),
    enabled: z.boolean().default(true),
    decisive: z.boolean().default(false),
    condition: ruleConditionSchema,
    explanation: z.string().trim().min(1).max(300),
  })
  .strict();
const rulePatch = z
  .object({
    targetCategory: categorySchema,
    scoreValue: z.number().min(-100).max(100),
    enabled: z.boolean(),
    condition: ruleConditionSchema,
    explanation: z.string().trim().min(1).max(300),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'nothing to update');

const ROLE_RANK: Record<Role, number> = { reader: 1, admin: 2 };

export function buildServer(container: Container, authenticator: TokenAuthenticator) {
  const { db, metrics, log, classification, review, jobs, knowledge } = container;
  const app = Fastify({ loggerInstance: log, bodyLimit: 256 * 1024 });

  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request) => {
    const required = request.routeOptions.config.role;
    if (!required) return;
    const principal = authenticator.authenticate(request.headers.authorization);
    if (!principal) throw new HttpError(401, 'Missing or invalid API token');
    if (ROLE_RANK[principal.role] < ROLE_RANK[required]) throw new HttpError(403, `This requires the ${required} role`);
    request.principal = principal;
  });

  app.addHook('onResponse', async (request, reply) => {
    metrics.http(request.method, request.routeOptions.url ?? 'unmatched', reply.statusCode, reply.elapsedTime / 1000);
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'invalid-request', issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (error instanceof ReviewError) {
      const status = error.code === 'not-found' ? 404 : error.code === 'conflict' ? 409 : 400;
      return reply.status(status).send({ error: error.code, message: error.message });
    }
    if (error instanceof AniListError) {
      const status = error.kind === 'not-found' ? 404 : error.kind === 'rate-limit' ? 503 : 502;
      if (error.retryAfterSeconds) reply.header('Retry-After', String(error.retryAfterSeconds));
      return reply.status(status).send({ error: `anilist-${error.kind}`, message: error.message });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.status(status).send({ error: 'internal', message: 'Internal error', requestId: request.id });
    }
    return reply.status(status).send({ error: 'request-error', message: error.message });
  });

  // --- Operations ---------------------------------------------------------------------------------------

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ready', engine: { name: container.engine.name, version: container.engine.version } };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  app.get('/metrics', { config: { role: 'reader' } }, async (_request, reply) => {
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  // --- Imports ------------------------------------------------------------------------------------------

  app.post('/v1/imports', { config: { role: 'admin' } }, async (request, reply) => {
    const { anilistId } = importBody.parse(request.body);
    const jobId = await jobs.enqueue(db, 'IMPORT_ANIME', anilistId, request.principal!.name);
    return reply.status(202).send({ jobId, status: 'PENDING', statusUrl: `/v1/jobs/${jobId}` });
  });

  app.get('/v1/jobs/:id', { config: { role: 'reader' } }, async (request) => {
    const { id } = idParam.parse(request.params);
    const job = await jobs.get(db, id);
    if (!job) throw new HttpError(404, `Job ${id} does not exist`);
    return job;
  });

  // --- Classification -----------------------------------------------------------------------------------

  /** Dry run: classifies a described episode with current knowledge and stores nothing. */
  app.post('/v1/classify', { config: { role: 'reader' } }, async (request) => {
    const body = classifyBody.parse(request.body);
    const anime = await getAnime(db, body.anilistId);
    if (!anime) throw new HttpError(404, `Anime ${body.anilistId} has not been imported`);
    const prediction = await classification.preview(anime, body.episode);
    return predictionToResponse(anime.id, body.episode.number, prediction);
  });

  async function findEpisode(request: FastifyRequest): Promise<EpisodeRow> {
    const { animeId, number } = episodeParams.parse(request.params);
    const { rows } = await db.query<EpisodeRow>('SELECT * FROM episodes WHERE anime_id = $1 AND number = $2', [animeId, number]);
    if (!rows[0]) throw new HttpError(404, `Anime ${animeId} has no episode ${number}`);
    return rows[0];
  }

  app.get('/v1/anime/:animeId/episodes/:number/classification', { config: { role: 'reader' } }, async (request) => {
    const episode = await findEpisode(request);
    const response = await loadClassification(db, episode);
    if (!response) throw new HttpError(404, `Episode ${episode.number} has not been classified yet`);
    return response;
  });

  app.get('/v1/anime/:animeId/episodes', { config: { role: 'reader' } }, async (request) => {
    const { animeId } = animeParams.parse(request.params);
    const query = z
      .object({ ...page, limit: z.coerce.number().int().min(1).max(500).default(200), category: categorySchema.optional(), tag: z.string().max(60).optional() })
      .parse(request.query);
    const { rows } = await db.query<Pick<EpisodeRow, 'id' | 'number' | 'title' | 'category' | 'confidence' | 'decision' | 'trust_level' | 'review_status' | 'arc_name'>>(
      `SELECT e.id, e.number, e.title, e.arc_name, e.category, e.confidence, e.decision, e.trust_level, e.review_status
       FROM episodes e
       WHERE e.anime_id = $1 AND e.number > $2
         AND ($3::text IS NULL OR e.category = $3)
         AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM episode_tags t WHERE t.episode_id = e.id AND t.tag = $4))
       ORDER BY e.number LIMIT $5`,
      [animeId, query.after, query.category ?? null, query.tag ?? null, query.limit],
    );
    return {
      episodes: rows.map((r) => ({
        id: r.id,
        episode: r.number,
        title: r.title,
        arc: r.arc_name,
        classification: r.category ? CATEGORY_LABELS[r.category] : null,
        category: r.category,
        confidence: r.confidence === null ? null : Math.round(r.confidence * 100),
        decision: r.decision,
        trust: r.trust_level,
        reviewStatus: r.review_status,
      })),
      next: rows.length === query.limit ? rows.at(-1)!.number : null,
    };
  });

  app.get('/v1/anime/:animeId/profile', { config: { role: 'reader' } }, async (request) => {
    const { animeId } = animeParams.parse(request.params);
    const { rows } = await db.query('SELECT * FROM series_profiles WHERE anime_id = $1', [animeId]);
    if (!rows[0]) throw new HttpError(404, `No profile for anime ${animeId}`);
    return rows[0];
  });

  app.get('/v1/anime/:animeId/arcs', { config: { role: 'reader' } }, async (request) => {
    const { animeId } = animeParams.parse(request.params);
    const { rows } = await db.query(
      `SELECT start_episode, end_episode, category, kind, confidence, episode_count, name
       FROM arc_profiles WHERE anime_id = $1 ORDER BY start_episode`,
      [animeId],
    );
    return { arcs: rows };
  });

  // --- Review -------------------------------------------------------------------------------------------

  app.get('/v1/review-queue', { config: { role: 'reader' } }, async (request) => {
    const query = z.object({ ...page, decision: z.enum(['NEEDS_REVIEW', 'SUGGESTED', 'AUTO_APPROVED']).default('NEEDS_REVIEW') }).parse(request.query);
    const { rows } = await db.query<EpisodeRow & { anime_title: string }>(
      `SELECT e.*, a.title AS anime_title FROM episodes e JOIN anime a ON a.id = e.anime_id
       WHERE e.review_status = 'UNREVIEWED' AND e.origin = 'engine' AND e.decision = $1 AND e.id > $2
       ORDER BY e.id LIMIT $3`,
      [query.decision, query.after, query.limit],
    );
    const items = await Promise.all(
      rows.map(async (row) => ({ animeTitle: row.anime_title, ...(await loadClassification(db, row)) })),
    );
    return { items, next: rows.length === query.limit ? rows.at(-1)!.id : null };
  });

  app.post('/v1/episodes/:id/review', { config: { role: 'admin' } }, async (request) => {
    const { id } = idParam.parse(request.params);
    const body = reviewBody.parse(request.body);
    return review.review({ ...body, episodeId: id, reviewer: request.principal!.name });
  });

  /** Tells the engine something AniList can't, such as "anime-original". Machine-detected tags never overwrite it. */
  app.post('/v1/episodes/:id/tags', { config: { role: 'admin' } }, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const { tag } = tagBody.parse(request.body);
    const { rows } = await db.query<{ anime_id: number }>('SELECT anime_id FROM episodes WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, `Episode ${id} does not exist`);
    await db.tx(async (tx) => {
      await tx.query(
        `INSERT INTO episode_tags (episode_id, tag, source) VALUES ($1, $2, 'manual')
         ON CONFLICT (episode_id, tag) DO UPDATE SET source = 'manual'`,
        [id, tag],
      );
      await jobs.enqueue(tx, 'RECLASSIFY_SERIES', rows[0]!.anime_id, request.principal!.name);
    });
    request.log.info({ episodeId: id, tag, by: request.principal!.name }, 'episode tagged');
    return reply.status(201).send({ episodeId: id, tag });
  });

  app.get('/v1/episodes/:id/history', { config: { role: 'reader' } }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { rows } = await db.query(
      `SELECT id, category, confidence, evidence_tier, decision, origin, trust_level, engine_name, engine_version, reasons, created_at
       FROM classification_history WHERE episode_id = $1 ORDER BY id DESC LIMIT 200`,
      [id],
    );
    return { classifications: rows, reviews: await loadReviewHistory(db, id) };
  });

  // --- Rules --------------------------------------------------------------------------------------------

  function ruleWithStats(row: Record<string, unknown>) {
    const counts: RuleOutcomeCounts = {
      highFires: row.high_fires as number,
      highCorrect: row.high_correct as number,
      mediumFires: row.medium_fires as number,
      mediumCorrect: row.medium_correct as number,
    };
    return { ...toRule(row as never), stats: { ...counts, accuracy: Number(ruleAccuracy(counts).toFixed(3)) } };
  }

  app.get('/v1/rules', { config: { role: 'reader' } }, async () => {
    const { rows } = await db.query('SELECT * FROM classification_rules ORDER BY id');
    return { rules: rows.map(ruleWithStats) };
  });

  app.post('/v1/rules', { config: { role: 'admin' } }, async (request, reply) => {
    const rule = ruleBody.parse(request.body);
    const { rows } = await db.query(
      `INSERT INTO classification_rules (rule_name, target_category, score_value, enabled, decisive, condition, explanation)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (rule_name) DO NOTHING RETURNING *`,
      [rule.ruleName, rule.targetCategory, rule.scoreValue, rule.enabled, rule.decisive, JSON.stringify(rule.condition), rule.explanation],
    );
    if (!rows[0]) throw new HttpError(409, `A rule named "${rule.ruleName}" already exists`);
    knowledge.invalidate();
    request.log.info({ rule: rule.ruleName, by: request.principal!.name }, 'rule created');
    return reply.status(201).send(ruleWithStats(rows[0]));
  });

  app.patch('/v1/rules/:id', { config: { role: 'admin' } }, async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = rulePatch.parse(request.body);
    const { rows } = await db.query(
      `UPDATE classification_rules SET
         target_category = COALESCE($2, target_category),
         score_value = COALESCE($3, score_value),
         enabled = COALESCE($4, enabled),
         condition = COALESCE($5::jsonb, condition),
         explanation = COALESCE($6, explanation),
         last_updated = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.targetCategory ?? null,
        patch.scoreValue ?? null,
        patch.enabled ?? null,
        patch.condition ? JSON.stringify(patch.condition) : null,
        patch.explanation ?? null,
      ],
    );
    if (!rows[0]) throw new HttpError(404, `Rule ${id} does not exist`);
    knowledge.invalidate();
    request.log.info({ ruleId: id, patch, by: request.principal!.name }, 'rule updated');
    return ruleWithStats(rows[0]);
  });

  // --- Statistics ---------------------------------------------------------------------------------------

  app.get('/v1/stats/monthly', { config: { role: 'reader' } }, async (request) => {
    const { month } = z
      .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(() => new Date().toISOString().slice(0, 7)) })
      .parse(request.query);
    return monthlyStats(db, month);
  });

  return app;
}
