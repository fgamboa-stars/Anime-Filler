import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Queryable } from '../db/database.js';
import type { Category } from '../domain/types.js';
import { NO_ARC } from '../engine/arc.js';

/** What the site's dataset format can express. It has no way to show OVA, Special or Movie yet. */
const SITE_TYPES: ReadonlySet<Category> = new Set(['CANON', 'MIXED', 'FILLER', 'ANIME_CANON']);

export interface ExportResult {
  slug: string;
  path: string | null;
  published: number;
  /** Not yet good enough for the public site: suggestions and predictions waiting on a person. */
  heldForReview: number[];
  /** Classified as something the site can't display. */
  unsupportedCategory: number[];
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface ExportEpisode {
  number: number;
  title: string | null;
  arc_name: string | null;
  category: Category | null;
  decision: string | null;
  origin: string | null;
}

/**
 * Writes `src/data/anime/<slug>.json` for the static site. Publishes only labels that passed: reviewed,
 * curated or auto-approved. A partial export lists what it held back, rather than guessing on the public site.
 * Run `npm run data:index` at the repo root afterwards.
 */
export async function exportDataset(db: Queryable, animeId: number, outDir: string, options: { dryRun?: boolean } = {}): Promise<ExportResult> {
  const { rows: animeRows } = await db.query<{
    id: number;
    slug: string | null;
    title: string;
    alternative_titles: string[];
    franchise: string | null;
    season_label: string | null;
    franchise_order: number | null;
  }>('SELECT id, slug, title, alternative_titles, franchise, season_label, franchise_order FROM anime WHERE id = $1', [animeId]);
  const anime = animeRows[0];
  if (!anime) throw new Error(`Unknown anime ${animeId}`);

  const { rows: episodes } = await db.query<ExportEpisode>(
    'SELECT number, title, arc_name, category, decision, origin FROM episodes WHERE anime_id = $1 ORDER BY number',
    [animeId],
  );

  const slug = anime.slug ?? slugify(anime.title);
  const result: ExportResult = { slug, path: null, published: 0, heldForReview: [], unsupportedCategory: [] };
  const lines: string[] = [];

  for (const episode of episodes) {
    const passed = episode.origin === 'human' || episode.origin === 'import' || episode.decision === 'AUTO_APPROVED';
    if (!episode.category || !passed) {
      result.heldForReview.push(episode.number);
    } else if (!SITE_TYPES.has(episode.category)) {
      result.unsupportedCategory.push(episode.number);
    } else {
      lines.push(
        `    ${JSON.stringify({
          number: episode.number,
          title: episode.title ?? `Episode ${episode.number}`,
          type: episode.category,
          arc: episode.arc_name ?? NO_ARC,
        })}`,
      );
    }
  }
  result.published = lines.length;
  if (lines.length === 0 || options.dryRun) return result;

  const header = {
    schemaVersion: 1,
    slug,
    anilistId: anime.id,
    title: anime.title,
    alternativeTitles: anime.alternative_titles,
    totalEpisodes: lines.length,
    source: 'Classified by the Anime Filler classification service',
    ...(anime.franchise ? { franchise: anime.franchise } : {}),
    ...(anime.franchise && anime.season_label ? { seasonLabel: anime.season_label } : {}),
    ...(anime.franchise && anime.franchise_order ? { franchiseOrder: anime.franchise_order } : {}),
    updatedAt: new Date().toISOString(),
  };
  // One episode per line, like the other datasets, so pull-request diffs stay readable.
  const body = `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "episodes": [\n${lines.join(',\n')}\n  ]\n}\n`;
  result.path = join(outDir, `${slug}.json`);
  writeFileSync(result.path, body);
  return result;
}
