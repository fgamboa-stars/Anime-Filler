import { createHash } from 'node:crypto';
import type { AnimeMeta, Category, EpisodeInput, ReviewStatus, TrustLevel } from '../domain/types.js';
import type { Queryable } from '../db/database.js';
import { toVectorLiteral } from '../db/database.js';
import { buildEmbeddingDocument, documentHash, type Embedder } from '../embedding/embedder.js';

export interface EpisodeRow {
  id: number;
  anime_id: number;
  number: number;
  title: string | null;
  description: string | null;
  arc_name: string | null;
  aired_at: Date | null;
  content_hash: string;
  input_hash: string | null;
  current_classification_id: number | null;
  category: Category | null;
  confidence: number | null;
  decision: string | null;
  trust_level: TrustLevel;
  review_status: ReviewStatus;
  origin: 'engine' | 'human' | 'import' | null;
}

interface AnimeRow {
  id: number;
  title: string;
  format: string | null;
  source: string | null;
  status: string | null;
  season_year: number | null;
  total_episodes: number | null;
  genres: string[];
  tags: AnimeMeta['tags'];
  studios: string[];
  characters: string[];
  related_anime_ids: number[];
}

function toMeta(row: AnimeRow): AnimeMeta {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    source: row.source,
    status: row.status,
    seasonYear: row.season_year,
    totalEpisodes: row.total_episodes,
    genres: row.genres,
    tags: row.tags,
    studios: row.studios,
    characters: row.characters,
    relatedAnimeIds: row.related_anime_ids,
  };
}

export async function getAnime(db: Queryable, id: number): Promise<AnimeMeta | null> {
  const { rows } = await db.query<AnimeRow>('SELECT * FROM anime WHERE id = $1', [id]);
  return rows[0] ? toMeta(rows[0]) : null;
}

export async function upsertAnime(
  db: Queryable,
  anime: AnimeMeta,
  extra: { slug?: string; franchise?: string | null; seasonLabel?: string | null; franchiseOrder?: number | null; alternativeTitles?: string[] } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO anime (id, title, format, source, status, season_year, total_episodes, genres, tags, studios, characters,
                        related_anime_ids, slug, franchise, season_label, franchise_order, alternative_titles)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, format = EXCLUDED.format, source = EXCLUDED.source, status = EXCLUDED.status,
       season_year = EXCLUDED.season_year, total_episodes = EXCLUDED.total_episodes, genres = EXCLUDED.genres,
       tags = EXCLUDED.tags, studios = EXCLUDED.studios, characters = EXCLUDED.characters,
       related_anime_ids = EXCLUDED.related_anime_ids,
       slug = COALESCE(EXCLUDED.slug, anime.slug),
       franchise = COALESCE(EXCLUDED.franchise, anime.franchise),
       season_label = COALESCE(EXCLUDED.season_label, anime.season_label),
       franchise_order = COALESCE(EXCLUDED.franchise_order, anime.franchise_order),
       alternative_titles = CASE WHEN cardinality(EXCLUDED.alternative_titles) > 0 THEN EXCLUDED.alternative_titles ELSE anime.alternative_titles END,
       updated_at = now()`,
    [
      anime.id,
      anime.title,
      anime.format,
      anime.source,
      anime.status,
      anime.seasonYear,
      anime.totalEpisodes,
      anime.genres,
      JSON.stringify(anime.tags),
      anime.studios,
      anime.characters,
      anime.relatedAnimeIds,
      extra.slug ?? null,
      extra.franchise ?? null,
      extra.seasonLabel ?? null,
      extra.franchiseOrder ?? null,
      extra.alternativeTitles ?? [],
    ],
  );
}

export function episodeContentHash(anime: AnimeMeta, episode: EpisodeInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        anime.format,
        anime.source,
        anime.totalEpisodes,
        anime.genres,
        anime.tags,
        episode.title,
        episode.description,
        episode.arc,
        [...episode.tags].sort(),
      ]),
    )
    .digest('hex')
    .slice(0, 32);
}

export async function getEpisodeTags(db: Queryable, episodeIds: number[], source?: 'manual'): Promise<Map<number, string[]>> {
  const { rows } = await db.query<{ episode_id: number; tag: string }>(
    `SELECT episode_id, tag FROM episode_tags WHERE episode_id = ANY($1::int[]) ${source ? `AND source = 'manual'` : ''}`,
    [episodeIds],
  );
  const tags = new Map<number, string[]>();
  for (const row of rows) tags.set(row.episode_id, [...(tags.get(row.episode_id) ?? []), row.tag]);
  return tags;
}

/** Replaces detector tags. Tags a reviewer added by hand survive. */
export async function syncDetectedTags(db: Queryable, episodeId: number, tags: string[]): Promise<void> {
  await db.query(`DELETE FROM episode_tags WHERE episode_id = $1 AND source = 'detector'`, [episodeId]);
  for (const tag of tags) {
    await db.query(
      `INSERT INTO episode_tags (episode_id, tag, source) VALUES ($1, $2, 'detector') ON CONFLICT DO NOTHING`,
      [episodeId, tag],
    );
  }
}

export interface EmbeddingTarget {
  anime: AnimeMeta;
  episodeId: number;
  input: EpisodeInput;
  trust: TrustLevel;
}

/**
 * Precomputes embeddings in batches and skips any whose inputs haven't changed. Returns vectors for the
 * targets, recomputing the ones already stored only if the hash moved.
 */
export async function ensureEmbeddings(db: Queryable, embedder: Embedder, targets: EmbeddingTarget[], batchSize = 200): Promise<number> {
  if (targets.length === 0) return 0;
  const { rows } = await db.query<{ episode_id: number; content_hash: string; model: string }>(
    'SELECT episode_id, content_hash, model FROM episode_embeddings WHERE episode_id = ANY($1::int[])',
    [targets.map((t) => t.episodeId)],
  );
  const existing = new Map(rows.map((r) => [r.episode_id, r]));

  const pending = targets
    .map((target) => {
      const document = buildEmbeddingDocument(target.anime, target.input);
      return { target, document, hash: documentHash(document, embedder.model) };
    })
    .filter(({ target, hash }) => existing.get(target.episodeId)?.content_hash !== hash);

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const vectors = await embedder.embed(batch.map((p) => p.document));
    const values: unknown[] = [];
    const placeholders = batch.map(({ target, hash }, j) => {
      const base = j * 6;
      values.push(target.episodeId, embedder.model, hash, target.anime.id, target.trust, toVectorLiteral(vectors[j]!));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::vector)`;
    });
    await db.query(
      `INSERT INTO episode_embeddings (episode_id, model, content_hash, anime_id, trust_level, embedding)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (episode_id) DO UPDATE SET
         model = EXCLUDED.model, content_hash = EXCLUDED.content_hash, trust_level = EXCLUDED.trust_level,
         embedding = EXCLUDED.embedding, updated_at = now()`,
      values,
    );
  }
  return pending.length;
}

export async function getEmbedding(db: Queryable, episodeId: number): Promise<Float32Array | null> {
  const { rows } = await db.query<{ embedding: string }>(
    'SELECT embedding::text AS embedding FROM episode_embeddings WHERE episode_id = $1',
    [episodeId],
  );
  return rows[0] ? Float32Array.from(JSON.parse(rows[0].embedding) as number[]) : null;
}
