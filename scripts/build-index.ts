#!/usr/bin/env tsx
/** Rebuild src/data/index.json from every dataset in src/data/anime/. */
import { buildCatalog, listDatasets, writeCatalog } from './lib/catalog.ts';

const catalog = buildCatalog(listDatasets());
writeCatalog(catalog);
console.log(`Catalog rebuilt with ${catalog.anime.length} anime:`);
for (const a of catalog.anime) console.log(`  ${a.slug} (AniList ${a.anilistId}) — ${a.totalEpisodes} episodes, ${a.fillerPercentage}% filler`);
