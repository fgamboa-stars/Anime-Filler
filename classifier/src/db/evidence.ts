import type { Category, LabeledEpisode, ReviewStatus, TrustLevel } from '../domain/types.js';
import type { EvidenceProvider, GlobalKnowledge, SeriesProfile, SimilarHit } from '../engine/evidence.js';
import { toVectorLiteral, type Queryable } from './database.js';
import type { KnowledgeCache } from './knowledge.js';

interface LabeledRow {
  anime_id: number;
  number: number;
  title: string | null;
  arc_name: string | null;
  category: Category;
  trust_level: TrustLevel;
  review_status: ReviewStatus;
}

function toLabeled(row: LabeledRow): LabeledEpisode {
  return {
    animeId: row.anime_id,
    number: row.number,
    title: row.title,
    arc: row.arc_name,
    category: row.category,
    trust: row.trust_level,
    reviewStatus: row.review_status,
  };
}

/**
 * Postgres evidence. Same-series search is exact, and the only place LOW trust appears. Cross-series search
 * goes through the partial HNSW index, which holds trusted examples only.
 */
export class PostgresEvidence implements EvidenceProvider {
  constructor(
    private readonly db: Queryable,
    private readonly knowledge: KnowledgeCache,
  ) {}

  globalKnowledge(): Promise<GlobalKnowledge> {
    return this.knowledge.get();
  }

  async seriesEpisodes(animeId: number): Promise<LabeledEpisode[]> {
    const { rows } = await this.db.query<LabeledRow>(
      `SELECT anime_id, number, title, arc_name, category, trust_level, review_status
       FROM episodes WHERE anime_id = $1 AND category IS NOT NULL ORDER BY number`,
      [animeId],
    );
    return rows.map(toLabeled);
  }

  async seriesProfile(animeId: number): Promise<SeriesProfile | null> {
    const { rows } = await this.db.query<{
      anime_id: number;
      distribution: SeriesProfile['distribution'];
      effective_count: number;
      labeled_count: number;
    }>('SELECT anime_id, distribution, effective_count, labeled_count FROM series_profiles WHERE anime_id = $1', [animeId]);
    const row = rows[0];
    return row
      ? { animeId: row.anime_id, distribution: row.distribution, effectiveCount: row.effective_count, labeledCount: row.labeled_count }
      : null;
  }

  async searchSimilar(
    vector: Float32Array,
    options: { animeId: number; number: number; limit: number; minSimilarity: number },
  ): Promise<SimilarHit[]> {
    const literal = toVectorLiteral(vector);
    const columns = `e.anime_id, e.number, e.title, e.arc_name, e.category, e.trust_level, e.review_status,
                     a.title AS anime_title, 1 - (v.embedding <=> $1::vector) AS similarity`;

    const [sameSeries, otherSeries] = await Promise.all([
      this.db.query<LabeledRow & { anime_title: string; similarity: number }>(
        `SELECT ${columns}
         FROM episode_embeddings v
         JOIN episodes e ON e.id = v.episode_id
         JOIN anime a ON a.id = e.anime_id
         WHERE v.anime_id = $2 AND e.number <> $3 AND e.category IS NOT NULL
         ORDER BY v.embedding <=> $1::vector
         LIMIT $4`,
        [literal, options.animeId, options.number, options.limit],
      ),
      // The literal trust predicate is what makes the planner pick the partial index.
      this.db.query<LabeledRow & { anime_title: string; similarity: number }>(
        `SELECT ${columns}
         FROM (
           SELECT episode_id, embedding FROM episode_embeddings
           WHERE trust_level IN ('HIGH', 'MEDIUM')
           ORDER BY embedding <=> $1::vector
           LIMIT $3
         ) v
         JOIN episodes e ON e.id = v.episode_id
         JOIN anime a ON a.id = e.anime_id
         WHERE e.anime_id <> $2 AND e.category IS NOT NULL`,
        [literal, options.animeId, options.limit * 3],
      ),
    ]);

    return [...sameSeries.rows, ...otherSeries.rows]
      .filter((row) => row.similarity >= options.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit)
      .map((row) => ({ episode: toLabeled(row), animeTitle: row.anime_title, similarity: row.similarity }));
  }
}
