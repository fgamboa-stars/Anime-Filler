#!/usr/bin/env tsx
/**
 * Step 2 of the AnimeFillerList helper: import matched shows.
 *
 *   npm run afl:import                     # every matched show not imported yet
 *   npm run afl:import -- toradora         # specific shows (re-imports if needed)
 *   npm run afl:import -- --dry-run
 *
 * For each show in data/afl/manifest.json with status "matched" or "manual":
 *   1. re-checks on AniList that every season has finished airing,
 *   2. splits the AnimeFillerList list into AniList's seasons (renumbered from 1),
 *   3. writes one CSV per season to data/seed/,
 *   4. runs the normal CSV importer on it (npm run import:csv).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { parseAflShow, pickTitle, searchTermsFor, seasonLabelFor, splitSeasons, toImporterCsv } from './lib/afl.ts';
import { ROOT, listDatasets } from './lib/catalog.ts';
import { readManifest, upsert, writeManifest, type ManifestEntry } from './lib/manifest.ts';
import { fetchAflPage, getMedia } from './lib/sources.ts';
import { slugify } from '../src/utils/dataset.ts';

const SEED_DIR = join(ROOT, 'data', 'seed');
const SOURCE = 'Classifications compiled from AnimeFillerList.com';

async function importShow(entry: ManifestEntry, dryRun: boolean): Promise<string[]> {
  const seasons = entry.seasons ?? [];
  if (!seasons.length) throw new Error('no AniList seasons in the manifest');

  // Finished shows only: refuse if any season is airing, upcoming or on hiatus.
  const media = await getMedia(seasons.map((s) => s.anilistId));
  for (const s of seasons) {
    const m = media.find((x) => x.id === s.anilistId);
    if (!m) throw new Error(`AniList has no entry ${s.anilistId}`);
    if (m.status !== 'FINISHED') throw new Error(`${s.title} is ${m.status ?? 'unknown'} on AniList, not finished`);
    if (m.episodes !== s.episodes) throw new Error(`${s.title} now has ${m.episodes ?? '?'} episodes on AniList (manifest: ${s.episodes})`);
  }

  const html = await fetchAflPage(`shows/${entry.afl}`);
  if (!html) throw new Error('AnimeFillerList page not found');
  const show = parseAflShow(html);
  const parts = splitSeasons(show.episodes, seasons.map((s) => s.episodes));

  const [aflName, altName] = searchTermsFor(entry.name);
  const first = media.find((x) => x.id === seasons[0].anilistId)!;
  // AnimeFillerList writes some names in capitals ("GURREN LAGANN"); prefer AniList's casing then.
  const baseName = aflName === aflName.toUpperCase() ? pickTitle(first.title.english, first.title.romaji) || aflName : aflName;
  const franchise = seasons.length > 1 ? baseName : undefined;
  const existing = listDatasets();
  const slugs: string[] = [];

  for (const [i, season] of seasons.entries()) {
    const m = media.find((x) => x.id === season.anilistId)!;
    const title = seasons.length === 1 ? baseName : pickTitle(m.title.english, m.title.romaji);
    const owner = existing.find((d) => d.anilistId === season.anilistId);
    if (owner && !entry.imported?.includes(owner.slug))
      throw new Error(`AniList ID ${season.anilistId} already belongs to "${owner.title}" (${owner.slug}), which this helper did not create`);
    let slug = owner?.slug ?? (slugify(title) || `anime-${season.anilistId}`);
    // Two seasons can slugify alike ("Kaguya-sama: Love is War" and "…Love is War?"); never let one overwrite the other.
    if (!owner && slugs.includes(slug)) slug = `${slug}-season-${i + 1}`;
    if (!owner && existing.some((d) => d.slug === slug)) slug = `${slug}-${season.anilistId}`;

    const { offset, episodes } = parts[i];
    // A dry run writes its CSV to the cache so data/seed/ is left untouched.
    const csvPath = join(dryRun ? join(ROOT, '.cache', 'afl', 'dry-run') : SEED_DIR, `${slug}.csv`);
    const source =
      i === 0 ? SOURCE : `${SOURCE} (overall episodes ${offset + 1}–${offset + episodes.length}, renumbered to match AniList)`;
    // Search is English/romaji, so only Latin-script synonyms help.
    const latinSynonyms = (m.synonyms ?? []).filter((s) => /^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u.test(s)).slice(0, 3);
    const alts = [...new Set([altName, m.title.romaji, m.title.english, ...latinSynonyms])].filter(
      (t): t is string => Boolean(t) && t !== title,
    );

    const args = [csvPath, '--slug', slug, '--source', source, '--replace', '--strict', '--offline'];
    for (const alt of alts) args.push('--alt', alt);
    if (franchise) {
      const prefixes = [franchise, aflName, pickTitle(first.title.english, first.title.romaji), first.title.romaji ?? ''];
      args.push('--franchise', franchise, '--season-label', seasonLabelFor(title, prefixes, i), '--franchise-order', String(i + 1));
    }
    if (dryRun) args.push('--dry-run');
    args.push('--report', join(ROOT, 'reports', `afl-${slug}.md`));

    mkdirSync(dirname(csvPath), { recursive: true });
    writeFileSync(csvPath, toImporterCsv(title, season.anilistId, episodes));
    const run = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'import-csv.ts'), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (run.status !== 0) throw new Error(`importer failed for ${slug}:\n${run.stdout}${run.stderr}`);
    console.log(`    ${relative(ROOT, csvPath)} → src/data/anime/${slug}.json (${episodes.length} episodes)`);
    slugs.push(slug);
  }
  return slugs;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log('Usage: npm run afl:import -- [afl-slug ...] [--dry-run]');
    return 0;
  }

  const manifest = readManifest();
  const ready = manifest.shows.filter((s) => s.status === 'matched' || s.status === 'manual');
  const queue = positionals.length ? ready.filter((s) => positionals.includes(s.afl)) : ready.filter((s) => !s.imported?.length);
  if (!queue.length) {
    console.log('Nothing to import. Run npm run afl:match first, or name shows from data/afl/manifest.json.');
    return 0;
  }

  let ok = 0;
  const failures: string[] = [];
  for (const entry of queue) {
    console.log(`• ${entry.name}`);
    try {
      const slugs = await importShow(entry, values['dry-run']);
      if (!values['dry-run']) {
        upsert(manifest, { ...entry, imported: slugs });
        writeManifest(manifest);
      }
      ok++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${entry.name}: ${message}`);
      console.error(`  ✖ ${message}`);
    }
  }
  console.log(`\nImported ${ok} of ${queue.length} show(s)${values['dry-run'] ? ' (dry run, nothing written)' : ''}.`);
  if (failures.length) console.log(`Failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  console.log('Next: npm run data:validate && npm test');
  return failures.length && !ok ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
