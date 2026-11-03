import { createHash } from 'node:crypto';
import type { Database, Queryable } from '../db/database.js';
import { loadDetectors } from '../db/knowledge.js';
import type { KnowledgeCache } from '../db/knowledge.js';
import type { TagDetector } from '../domain/rules.js';
import type { AnimeMeta, EpisodeInput } from '../domain/types.js';
import type { ClassifierEngine, Prediction } from '../engine/classifier.js';
import { detectEpisodeTags } from '../engine/learning.js';
import type { Embedder } from '../embedding/embedder.js';
import { buildEmbeddingDocument } from '../embedding/embedder.js';
import type { Metrics } from '../observability/metrics.js';
import { ensureEmbeddings, episodeContentHash, getAnime, getEmbedding, getEpisodeTags, syncDetectedTags, type EpisodeRow } from './catalog.js';
import { NO_TRUSTED_EVIDENCE, type LearningService } from './learning.js';

export interface ClassifyBatchResult {
  animeId: number;
  episodes: number;
  classified: number;
  cached: number;
  skippedProtected: number;
  byDecision: Record<string, number>;
}

/** Everything about a prediction, written in one transaction so a stored decision is always fully traceable. */
export async function persistPrediction(tx: Queryable, episodeId: number, prediction: Prediction, inputHash: string): Promise<number | null> {
  const { rows: locked } = await tx.query<Pick<EpisodeRow, 'review_status' | 'origin'>>(
    'SELECT review_status, origin FROM episodes WHERE id = $1 FOR UPDATE',
    [episodeId],
  );
  const current = locked[0];
  // A reviewer may have got there while the engine was working.
  if (!current || current.review_status !== 'UNREVIEWED' || current.origin === 'human' || current.origin === 'import') return null;

  const { rows } = await tx.query<{ id: number }>(
    `INSERT INTO classification_history
       (episode_id, category, confidence, raw_score, evidence_tier, decision, origin, trust_level, engine_name, engine_version,
        distribution, reasons, supporting_rules, similar_episodes, arc_context)
     VALUES ($1,$2,$3,$4,$5,$6,'engine','LOW',$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
     RETURNING id`,
    [
      episodeId,
      prediction.category,
      prediction.confidence,
      prediction.rawScore,
      prediction.evidenceTier,
      prediction.decision,
      prediction.engine.name,
      prediction.engine.version,
      JSON.stringify(prediction.distribution),
      JSON.stringify(prediction.reasons),
      JSON.stringify(prediction.supportingRules),
      JSON.stringify(prediction.similarEpisodes),
      JSON.stringify(prediction.arc),
    ],
  );
  const classificationId = rows[0]!.id;

  for (const score of prediction.contributors) {
    await tx.query(
      `INSERT INTO prediction_scores (classification_id, contributor, weight, strength, support, share, top_category, distribution, reasons)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        classificationId,
        score.name,
        score.weight,
        score.strength,
        score.support,
        score.share,
        score.topCategory,
        JSON.stringify(score.distribution),
        JSON.stringify(score.reasons),
      ],
    );
  }
  for (const hit of prediction.supportingRules) {
    await tx.query(
      `INSERT INTO classification_rule_hits (classification_id, rule_id, target_category, score_value, applied_score)
       VALUES ($1,$2,$3,$4,$5)`,
      [classificationId, hit.ruleId, hit.targetCategory, hit.scoreValue, hit.appliedScore],
    );
  }

  await tx.query(
    `UPDATE episodes SET current_classification_id = $2, category = $3, confidence = $4, decision = $5,
       trust_level = 'LOW', origin = 'engine', input_hash = $6, updated_at = now()
     WHERE id = $1`,
    [episodeId, classificationId, prediction.category, prediction.confidence, prediction.decision, inputHash],
  );
  return classificationId;
}

/** Skips a new history row only if nothing visible would change, including the stored explanation. */
async function samePrediction(db: Queryable, row: EpisodeRow, prediction: Prediction): Promise<boolean> {
  if (
    row.current_classification_id === null ||
    row.category !== prediction.category ||
    row.decision !== prediction.decision ||
    Math.round((row.confidence ?? 0) * 100) !== Math.round(prediction.confidence * 100)
  ) {
    return false;
  }
  const { rows } = await db.query<{ reasons: string[]; evidence_tier: string | null }>(
    'SELECT reasons, evidence_tier FROM classification_history WHERE id = $1',
    [row.current_classification_id],
  );
  return rows[0]?.evidence_tier === prediction.evidenceTier && JSON.stringify(rows[0]?.reasons) === JSON.stringify(prediction.reasons);
}

export class ClassificationService {
  constructor(
    private readonly db: Database,
    private readonly engine: ClassifierEngine,
    private readonly embedder: Embedder,
    private readonly knowledge: KnowledgeCache,
    private readonly learning: LearningService,
    private readonly metrics: Metrics,
  ) {}

  /** Classifies every episode of a series that a machine is still allowed to decide. Safe to run repeatedly. */
  async classifySeries(animeId: number): Promise<ClassifyBatchResult> {
    const anime = await getAnime(this.db, animeId);
    if (!anime) throw new Error(`Unknown anime ${animeId}`);

    const { rows: episodes } = await this.db.query<EpisodeRow>('SELECT * FROM episodes WHERE anime_id = $1 ORDER BY number', [animeId]);
    const detectors = await loadDetectors(this.db);
    const manualTags = await getEpisodeTags(this.db, episodes.map((e) => e.id), 'manual');
    const result: ClassifyBatchResult = { animeId, episodes: episodes.length, classified: 0, cached: 0, skippedProtected: 0, byDecision: {} };

    const inputs = new Map<number, EpisodeInput>();
    await this.db.tx(async (tx) => {
      for (const episode of episodes) {
        const manual = manualTags.get(episode.id) ?? [];
        const detected = detectEpisodeTags(detectors, { title: episode.title, description: episode.description, arc: episode.arc_name });
        const tags = [...new Set([...manual, ...detected])];
        inputs.set(episode.id, {
          animeId,
          number: episode.number,
          title: episode.title,
          description: episode.description,
          arc: episode.arc_name,
          tags,
        });
        await syncDetectedTags(tx, episode.id, detected);
      }
    });

    await ensureEmbeddings(
      this.db,
      this.embedder,
      episodes.map((e) => ({ anime, episodeId: e.id, input: inputs.get(e.id)!, trust: e.trust_level })),
    );

    const knowledge = await this.knowledge.get();
    const { rows: versions } = await this.db.query<{ evidence_hash: string }>(
      'SELECT evidence_hash FROM series_profiles WHERE anime_id = $1',
      [animeId],
    );
    const evidenceHash = versions[0]?.evidence_hash ?? NO_TRUSTED_EVIDENCE;

    for (const episode of episodes) {
      if (episode.review_status !== 'UNREVIEWED' || episode.origin === 'human' || episode.origin === 'import') {
        result.skippedProtected += 1;
        continue;
      }
      const input = inputs.get(episode.id)!;
      const contentHash = episodeContentHash(anime, input);
      const inputHash = createHash('sha256')
        .update([contentHash, this.engine.name, this.engine.version, knowledge.version, evidenceHash].join('|'))
        .digest('hex')
        .slice(0, 32);

      if (episode.input_hash === inputHash) {
        result.cached += 1;
        this.metrics.decisionCacheHit();
        continue;
      }

      const started = performance.now();
      const prediction = await this.engine.classifyEpisode({
        anime,
        episode: input,
        vector: (await getEmbedding(this.db, episode.id)) ?? undefined,
      });
      this.metrics.classified(prediction.engine.name, prediction.category, prediction.decision, (performance.now() - started) / 1000);

      if (await samePrediction(this.db, episode, prediction)) {
        await this.db.query('UPDATE episodes SET input_hash = $2 WHERE id = $1', [episode.id, inputHash]);
      } else {
        await this.db.tx((tx) => persistPrediction(tx, episode.id, prediction, inputHash));
      }
      result.classified += 1;
      result.byDecision[prediction.decision] = (result.byDecision[prediction.decision] ?? 0) + 1;
    }

    await this.db.tx((tx) => this.learning.refreshSeries(tx, animeId));
    return result;
  }

  /** Classifies without storing anything. Evidence is live, but this episode's own record is ignored. */
  async preview(anime: AnimeMeta, episode: Omit<EpisodeInput, 'animeId' | 'tags'> & { tags?: string[] }): Promise<Prediction> {
    const detectors = await loadDetectors(this.db);
    const input = withDetectedTags(detectors, { ...episode, animeId: anime.id, tags: episode.tags ?? [] });
    const [vector] = await this.embedder.embed([buildEmbeddingDocument(anime, input)]);
    return this.engine.classifyEpisode({ anime, episode: input, vector });
  }
}

export function withDetectedTags(detectors: TagDetector[], episode: EpisodeInput): EpisodeInput {
  const detected = detectEpisodeTags(detectors, { title: episode.title, description: episode.description, arc: episode.arc });
  return { ...episode, tags: [...new Set([...episode.tags, ...detected])] };
}
