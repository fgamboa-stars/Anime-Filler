import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AniListClient } from '../anilist/client.js';
import type { AnimeMeta } from '../domain/types.js';

/**
 * Snapshots AniList metadata for every dataset the site ships, so the backtest and seeding are repeatable and
 * don't spend AniList's rate limit. Rerun when datasets are added.
 */
export async function fetchMetadataFixture(datasetsDir: string, outFile: string): Promise<Map<number, AnimeMeta>> {
  const ids = readdirSync(datasetsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => (JSON.parse(readFileSync(join(datasetsDir, file), 'utf8')) as { anilistId: number }).anilistId);

  const metadata = await new AniListClient().getAnimeBatch(ids);
  const missing = ids.filter((id) => !metadata.has(id));
  if (missing.length > 0) throw new Error(`AniList returned nothing for: ${missing.join(', ')}`);

  const sorted = [...metadata.values()].sort((a, b) => a.id - b.id);
  writeFileSync(outFile, `[\n${sorted.map((m) => JSON.stringify(m)).join(',\n')}\n]\n`);
  return metadata;
}
