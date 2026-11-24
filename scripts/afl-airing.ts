#!/usr/bin/env tsx
/**
 * Refresh still-airing shows (data/afl/airing.json) from AnimeFillerList.
 *
 *   npm run afl:airing              # every airing show
 *   npm run afl:airing -- one-piece # one show
 *
 * Adds newly listed episodes and updates changed classifications, keeping
 * existing arcs, then rebuilds src/data/index.json. Run supabase:seed after.
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
for (const show of shows) {
  const existing = readDataset(show.slug);
  if (!existing) {
    console.error(`✖ ${show.slug}: no guide in src/data/anime/ to update`);
    failed++;
    continue;
  }
  const html = await fetchAflPage(`/shows/${show.afl}`, { refresh: true });
  const parsed = html ? parseAflShow(html) : null;
  if (!parsed?.episodes.length) {
    console.error(`✖ ${show.slug}: AnimeFillerList page has no episode list`);
    failed++;
    continue;
  }
  // Guard against a broken page silently shrinking the guide.
  if (parsed.episodes.length < existing.episodes.length * 0.9) {
    console.error(`✖ ${show.slug}: AnimeFillerList lists ${parsed.episodes.length} episodes, guide has ${existing.episodes.length}; not updating`);
    failed++;
    continue;
  }
  const { dataset, added, changed } = mergeAiring(existing, parsed.episodes, show.newEpisodes);
  writeFileSync(datasetPath(show.slug), JSON.stringify(dataset, null, 2) + '\n');
  console.log(`✔ ${show.slug}: ${dataset.episodes.length} episodes (+${added} new, ${changed} changed)`);
}
writeCatalog(buildCatalog(listDatasets()));
process.exit(failed ? 1 : 0);
