import type { Database, Queryable } from '../db/database.js';
import type { KnowledgeCache } from '../db/knowledge.js';
import type { Category, EpisodeInput } from '../domain/types.js';
import { CATEGORY_LABELS } from '../domain/types.js';
import type { Metrics } from '../observability/metrics.js';
import { getAnime, getEpisodeTags, type EpisodeRow } from './catalog.js';
import type { JobQueue } from './jobs.js';
import type { LearningService } from './learning.js';

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'conflict' | 'invalid',
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

export interface ReviewCommand {
  episodeId: number;
  action: 'APPROVE' | 'OVERRIDE';
  /** Required for OVERRIDE. */
  category?: Category;
  reason?: string;
  reviewer: string;
  /** The classification the reviewer was looking at. A mismatch means someone else changed it first. */
  expectedClassificationId?: number;
}

export interface ReviewResult {
  episodeId: number;
  classificationId: number;
  auditId: number;
  category: Category;
  previousCategory: Category | null;
}

export class ReviewService {
  constructor(
    private readonly db: Database,
    private readonly learning: LearningService,
    private readonly jobs: JobQueue,
    private readonly knowledge: KnowledgeCache,
    private readonly metrics: Metrics,
  ) {}

  /** The decision, its audit record and everything learned from it commit together or not at all. */
  async review(command: ReviewCommand): Promise<ReviewResult> {
    const result = await this.db.tx(async (tx) => {
      const episode = await this.lockEpisode(tx, command);
      const category = this.resolveCategory(command, episode);

      const { rows: history } = await tx.query<{ id: number }>(
        `INSERT INTO classification_history (episode_id, category, confidence, origin, trust_level, reasons)
         VALUES ($1, $2, 1, 'human', 'HIGH', $3::jsonb) RETURNING id`,
        [
          episode.id,
          category,
          JSON.stringify([
            command.action === 'APPROVE'
              ? `Approved by ${command.reviewer}${command.reason ? `: ${command.reason}` : ''}`
              : `Set to ${CATEGORY_LABELS[category]} by ${command.reviewer}: ${command.reason}`,
          ]),
        ],
      );
      const classificationId = history[0]!.id;

      const { rows: audit } = await tx.query<{ id: number }>(
        `INSERT INTO review_audit_log (episode_id, action, original_classification_id, original_origin, original_prediction,
                                       original_confidence, new_classification_id, new_classification, reason, reviewer)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          episode.id,
          command.action,
          episode.current_classification_id,
          episode.origin,
          episode.category,
          episode.confidence,
          classificationId,
          category,
          command.reason ?? null,
          command.reviewer,
        ],
      );

      await tx.query(
        `UPDATE episodes SET current_classification_id = $2, category = $3, confidence = 1, decision = NULL,
           trust_level = 'HIGH', review_status = $4, origin = 'human', input_hash = NULL, updated_at = now()
         WHERE id = $1`,
        [episode.id, classificationId, category, command.action === 'APPROVE' ? 'APPROVED' : 'OVERRIDDEN'],
      );
      // Moves the vector into the trusted cross-series index.
      await tx.query(`UPDATE episode_embeddings SET trust_level = 'HIGH' WHERE episode_id = $1`, [episode.id]);

      const anime = (await getAnime(tx, episode.anime_id))!;
      const tags = (await getEpisodeTags(tx, [episode.id])).get(episode.id) ?? [];
      const input: EpisodeInput = {
        animeId: episode.anime_id,
        number: episode.number,
        title: episode.title,
        description: episode.description,
        arc: episode.arc_name,
        tags,
      };
      await this.learning.applyReview(tx, {
        anime,
        input,
        before: episode.category ? { category: episode.category, trust: episode.trust_level } : null,
        after: { category, trust: 'HIGH' },
      });
      await this.jobs.enqueue(tx, 'RECLASSIFY_SERIES', episode.anime_id, command.reviewer);

      return {
        episodeId: episode.id,
        classificationId,
        auditId: audit[0]!.id,
        category,
        previousCategory: episode.category,
      };
    });

    this.knowledge.invalidate();
    this.metrics.reviewed(command.action);
    return result;
  }

  private async lockEpisode(tx: Queryable, command: ReviewCommand): Promise<EpisodeRow> {
    const { rows } = await tx.query<EpisodeRow>('SELECT * FROM episodes WHERE id = $1 FOR UPDATE', [command.episodeId]);
    const episode = rows[0];
    if (!episode) throw new ReviewError(`Episode ${command.episodeId} does not exist`, 'not-found');
    if (command.expectedClassificationId !== undefined && episode.current_classification_id !== command.expectedClassificationId) {
      throw new ReviewError('This episode changed since it was loaded. Reload and review again.', 'conflict');
    }
    return episode;
  }

  private resolveCategory(command: ReviewCommand, episode: EpisodeRow): Category {
    if (command.action === 'APPROVE') {
      if (!episode.category) throw new ReviewError('Nothing to approve: this episode has no classification yet', 'invalid');
      if (command.category && command.category !== episode.category) {
        throw new ReviewError('An approval keeps the current classification. Use OVERRIDE to change it.', 'invalid');
      }
      return episode.category;
    }
    if (!command.category) throw new ReviewError('An override needs a category', 'invalid');
    if (!command.reason?.trim()) throw new ReviewError('An override needs a reason', 'invalid');
    if (command.category === episode.category) {
      throw new ReviewError('That is already the classification. Use APPROVE to confirm it.', 'invalid');
    }
    return command.category;
  }
}
