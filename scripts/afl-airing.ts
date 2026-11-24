#!/usr/bin/env tsx
/**
 * Refresh still-airing shows (data/afl/airing.json) from AnimeFillerList.
 *
 *   npm run afl:airing              # every airing show
 *   npm run afl:airing -- one-piece # one show
 *
 * Adds newly listed episodes and updates changed classifications, keeping
 * existing arcs, then rebuilds src/data/index.json. Run supabase:seed after.
 *
 * A show that can't be refreshed (page down, list looks broken) is left as it is and
 * reported; the run only fails when no show could be refreshed at all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseAflShow } from './lib/afl.ts';
import { mergeAiring, type AiringShow } from './lib/airing.ts';
import { ROOT, buildCatalog, datasetPath, listDatasets, readDataset, writeCatalog } from './lib/catalog.ts';
import { fetchAflPage } from './lib/sources.ts';

const { positionals } = parseArgs({ allowPositionals: true });
const config = JSON.parse(readFileSync(join(ROOT, 'data', 'afl', 'airing.json'), 'utf8')) as { shows: AiringShow[] };
const shows = config.shows.filter((s) => !positionals.length || positionals.includes(s.afl) || positionals.includes(s.slug));

let failed = 0;
const fail = (slug: string, message: string) => {
  console.error(`✖ ${slug}: ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${slug} was not refreshed: ${message}`);
  failed++;
};
for (const show of shows) {
  const existing = readDataset(show.slug);
  if (!existing) {
    fail(show.slug, 'no guide in src/data/anime/ to update');
    continue;
  }
  let html: string | null;
  try {
    html = await fetchAflPage(`/shows/${show.afl}`, { refresh: true });
  } catch (err) {
    fail(show.slug, `download failed: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const parsed = html ? parseAflShow(html) : null;
  if (!parsed?.episodes.length) {
    fail(show.slug, 'AnimeFillerList page has no episode list');
    continue;
  }
  // Guard against a broken page silently shrinking the guide.
  if (parsed.episodes.length < existing.episodes.length * 0.9) {
    fail(show.slug, `AnimeFillerList lists ${parsed.episodes.length} episodes, guide has ${existing.episodes.length}; not updating`);
    continue;
  }
  const { dataset, added, changed } = mergeAiring(existing, parsed.episodes, show.newEpisodes);
  writeFileSync(datasetPath(show.slug), JSON.stringify(dataset, null, 2) + '\n');
  console.log(`✔ ${show.slug}: ${dataset.episodes.length} episodes (+${added} new, ${changed} changed)`);
}
writeCatalog(buildCatalog(listDatasets()));
process.exit(shows.length && failed === shows.length ? 1 : 0);
