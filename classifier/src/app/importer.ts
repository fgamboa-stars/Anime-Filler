import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AniListCache, AniListClient } from '../anilist/client.js';
import type { ImportedEpisode } from '../anilist/mapper.js';
import type { Database, Queryable } from '../db/database.js';
import { loadDetectors } from '../db/knowledge.js';
import type { AnimeMeta, Category, EpisodeInput } from '../domain/types.js';
import { NO_ARC } from '../engine/arc.js';
import { detectEpisodeTags } from '../engine/learning.js';
import type { Embedder } from '../embedding/embedder.js';
import { ensureEmbeddings, episodeContentHash, syncDetectedTags, upsertAnime, type EpisodeRow } from './catalog.js';
import type { ClassificationService, ClassifyBatchResult } from './classification.js';
import type { LearningService } from './learning.js';

export class PostgresAniListCache implements AniListCache {
  constructor(private readonly db: Queryable) {}

  async get(key: string): Promise<unknown | null> {
    const { rows } = await this.db.query<{ payload: unknown }>(
      'SELECT payload FROM anilist_cache WHERE key = $1 AND expires_at > now()',
      [key],
    );
    return rows[0]?.payload ?? null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.db.query(
      `INSERT INTO anilist_cache (key, payload, expires_at) VALUES ($1, $2::jsonb, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(value), String(ttlSeconds)],
    );
  }
}

export interface ImportResult extends ClassifyBatchResult {
  title: string;
  newEpisodes: number;
}

/** AniList to database to classified. Re-running is safe: titles refresh, decisions stay. */
export class AniListImporter {
  constructor(
    private readonly db: Database,
    private readonly anilist: AniListClient,
    private readonly classification: ClassificationService,
  ) {}

  async importAnime(anilistId: number): Promise<ImportResult> {
    const { anime, episodes } = await this.anilist.getAnimeWithEpisodes(anilistId);
    const detectors = await loadDetectors(this.db);

    const newEpisodes = await this.db.tx(async (tx) => {
      await upsertAnime(tx, anime);
      let added = 0;
      for (const episode of episodes) {
        if (await upsertImportedEpisode(tx, anime, episode, detectors)) added += 1;
      }
      return added;
    });

    const result = await this.classification.classifySeries(anilistId);
    return { ...result, title: anime.title, newEpisodes };
  }
}

async function upsertImportedEpisode(
  tx: Queryable,
  anime: AnimeMeta,
  episode: ImportedEpisode,
  detectors: Awaited<ReturnType<typeof loadDetectors>>,
): Promise<boolean> {
  const tags = detectEpisodeTags(detectors, { title: episode.title, description: null, arc: null });
  const input: EpisodeInput = { animeId: anime.id, number: episode.number, title: episode.title, description: null, arc: null, tags };
  const { rows } = await tx.query<{ inserted: boolean }>(
    // A known title or date is never blanked: AniList often drops streaming links for older shows.
    `INSERT INTO episodes (anime_id, number, title, aired_at, content_hash)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (anime_id, number) DO UPDATE SET
       title = COALESCE(EXCLUDED.title, episodes.title),
       aired_at = COALESCE(EXCLUDED.aired_at, episodes.aired_at),
       content_hash = EXCLUDED.content_hash,
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [anime.id, episode.number, episode.title, episode.airedAt, episodeContentHash(anime, input)],
  );
  return rows[0]!.inserted;
}

interface DatasetFile {
  slug: string;
  anilistId: number;
  title: string;
  alternativeTitles?: string[];
  franchise?: string;
  seasonLabel?: string;
  franchiseOrder?: number;
  episodes: Array<{ number: number; title: string; type: Category; arc?: string }>;
}

/**
 * Loads the site's curated datasets as MEDIUM-trust history. They're well-sourced but no admin here reviewed
 * them, so only an actual review earns HIGH. Episodes a human has reviewed are left as they are.
 */
export async function seedFromDatasets(
  db: Database,
  datasetsDir: string,
  metadataFile: string,
  embedder: Embedder,
  learning: LearningService,
): Promise<{ series: number; episodes: number; skippedReviewed: number }> {
  const metadata = new Map((JSON.parse(readFileSync(metadataFile, 'utf8')) as AnimeMeta[]).map((m) => [m.id, m]));
  const detectors = await loadDetectors(db);
  let series = 0;
  let total = 0;
  let skippedReviewed = 0;

  for (const file of readdirSync(datasetsDir).filter((f) => f.endsWith('.json')).sort()) {
    const dataset = JSON.parse(readFileSync(join(datasetsDir, file), 'utf8')) as DatasetFile;
    const anime = metadata.get(dataset.anilistId);
    if (!anime) throw new Error(`No AniList metadata for ${dataset.slug} (${dataset.anilistId}). Run \`cli fetch-fixture\`.`);

    const targets = await db.tx(async (tx) => {
      await upsertAnime(tx, anime, {
        slug: dataset.slug,
        franchise: dataset.franchise ?? null,
        seasonLabel: dataset.seasonLabel ?? null,
        franchiseOrder: dataset.franchiseOrder ?? null,
        alternativeTitles: dataset.alternativeTitles ?? [],
      });

      const embeddingTargets = [];
      for (const episode of dataset.episodes) {
        const arc = episode.arc && episode.arc !== NO_ARC ? episode.arc : null;
        const tags = detectEpisodeTags(detectors, { title: episode.title, description: null, arc });
        const input: EpisodeInput = { animeId: anime.id, number: episode.number, title: episode.title, description: null, arc, tags };

        const { rows } = await tx.query<EpisodeRow>(
          `INSERT INTO episodes (anime_id, number, title, arc_name, content_hash) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (anime_id, number) DO UPDATE SET
             title = EXCLUDED.title, arc_name = EXCLUDED.arc_name, content_hash = EXCLUDED.content_hash, updated_at = now()
           RETURNING *`,
          [anime.id, episode.number, episode.title, arc, episodeContentHash(anime, input)],
        );
        const row = rows[0]!;
        await syncDetectedTags(tx, row.id, tags);

        if (row.review_status !== 'UNREVIEWED') {
          skippedReviewed += 1;
          embeddingTargets.push({ anime, episodeId: row.id, input, trust: row.trust_level });
          continue;
        }
        if (row.origin !== 'import' || row.category !== episode.type) {
          const { rows: history } = await tx.query<{ id: number }>(
            `INSERT INTO classification_history (episode_id, category, confidence, origin, trust_level, reasons)
             VALUES ($1,$2,1,'import','MEDIUM',$3::jsonb) RETURNING id`,
            [row.id, episode.type, JSON.stringify([`Curated label from the ${dataset.slug} dataset`])],
          );
          await tx.query(
            `UPDATE episodes SET current_classification_id = $2, category = $3, confidence = 1, decision = NULL,
               trust_level = 'MEDIUM', origin = 'import', input_hash = NULL, updated_at = now()
             WHERE id = $1`,
            [row.id, history[0]!.id, episode.type],
          );
        }
        embeddingTargets.push({ anime, episodeId: row.id, input, trust: 'MEDIUM' as const });
        total += 1;
      }
      return embeddingTargets;
    });

    await ensureEmbeddings(db, embedder, targets);
    await db.query(
      `UPDATE episode_embeddings v SET trust_level = e.trust_level
       FROM episodes e WHERE e.id = v.episode_id AND e.anime_id = $1 AND v.trust_level <> e.trust_level`,
      [anime.id],
    );
    series += 1;
  }

  await db.tx((tx) => learning.rebuildAll(tx));
  return { series, episodes: total, skippedReviewed };
}
