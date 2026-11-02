#!/usr/bin/env tsx
/**
 * Import filler classifications from CSV into src/data/anime/<slug>.json
 * and regenerate the dataset catalog (src/data/index.json).
 *
 *   npm run import:csv -- data/bleach.csv --anilist-id 269
 *
 * Run with --help for every option. See docs/IMPORTING_DATA.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCsv } from './lib/csv.ts';
import { buildDataset, buildReport, groupByAnime, validateRecords, type BuildResult } from './lib/importer.ts';
import { ROOT, DATASET_DIR, buildCatalog, datasetPath, listDatasets, readDataset, writeCatalog } from './lib/catalog.ts';
import { serializeDataset, slugify } from '../src/utils/dataset.ts';

const HELP = `
Usage: npm run import:csv -- <file.csv> [options]

CSV columns: animeTitle,episodeNumber,title,type,arc[,anilistId]
  type: CANON | FILLER | MIXED | ANIME_CANON (also "Manga Canon", "Mixed Canon/Filler", "Anime Canon")

Options (apply when the CSV contains a single anime):
  --anilist-id <id>   AniList Media ID (required unless in the CSV, already imported, or found online)
  --slug <slug>       URL slug, e.g. "bleach" (default: slugified anime title)
  --title <title>     Display title (default: animeTitle column)
  --alt <title>       Alternative title for search; repeatable
  --source <text>     Attribution for the classifications

General:
  --replace           Replace the existing dataset instead of merging (merge is the default)
  --dry-run           Validate and report without writing files
  --strict            Exit with an error if any row is rejected
  --offline           Never query AniList to look up a missing ID
  --report <path>     Where to write the Markdown report (default: reports/import-<timestamp>.md)
  -h, --help          Show this help
`;

async function lookupAniListId(title: string): Promise<{ id: number; title: string } | null> {
  const endpoint = process.env.VITE_ANILIST_API ?? 'https://graphql.anilist.co';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: 'query ($s: String) { Media(search: $s, type: ANIME) { id title { romaji english } } }',
      variables: { s: title },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { Media?: { id: number; title: { romaji: string; english: string | null } } } };
  const media = json.data?.Media;
  return media ? { id: media.id, title: media.title.english ?? media.title.romaji } : null;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'anilist-id': { type: 'string' },
      slug: { type: 'string' },
      title: { type: 'string' },
      alt: { type: 'string', multiple: true },
      source: { type: 'string' },
      replace: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      offline: { type: 'boolean', default: false },
      report: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length !== 1) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }

  const file = positionals[0];
  const parsed = parseCsv(readFileSync(file, 'utf8'));
  const validation = validateRecords(parsed.headers, parsed.records);

  if (validation.missingColumns.length) {
    console.error(`✖ Missing required column(s): ${validation.missingColumns.join(', ')}`);
    console.error(`  Found: ${parsed.headers.join(', ') || '(none)'}`);
    return 1;
  }

  const groups = groupByAnime(validation.valid);
  const perAnimeFlags = values['anilist-id'] || values.slug || values.title;
  if (groups.size > 1 && perAnimeFlags) {
    console.error('✖ --anilist-id, --slug and --title only work when the CSV contains a single anime.');
    console.error('  Add an anilistId column instead, or split the file.');
    return 1;
  }

  const existingAll = listDatasets();
  const results: { result: BuildResult; outputPath: string; anilistIdSource: string }[] = [];
  let failed = false;

  for (const [animeTitle, rows] of groups) {
    const title = values.title ?? animeTitle;
    const existingByTitle = existingAll.find(
      (d) => d.title.toLowerCase() === title.toLowerCase() || d.alternativeTitles.some((t) => t.toLowerCase() === title.toLowerCase()),
    );
    const slug = values.slug ?? existingByTitle?.slug ?? slugify(title);
    const existing = readDataset(slug);

    let anilistId: number | undefined;
    let anilistIdSource = '';
    const columnIds = [...new Set(rows.map((r) => r.anilistId).filter((id): id is number => id !== undefined))];
    if (values['anilist-id']) {
      anilistId = Number(values['anilist-id']);
      anilistIdSource = '--anilist-id';
    } else if (columnIds.length === 1) {
      anilistId = columnIds[0];
      anilistIdSource = 'anilistId column';
    } else if (columnIds.length > 1) {
      console.error(`✖ "${animeTitle}": rows disagree on anilistId (${columnIds.join(', ')}).`);
      failed = true;
      continue;
    } else if (existing) {
      anilistId = existing.anilistId;
      anilistIdSource = 'existing dataset';
    } else if (!values.offline) {
      try {
        const found = await lookupAniListId(title);
        if (found) {
          anilistId = found.id;
          anilistIdSource = `AniList search match "${found.title}" — verify this is correct`;
        }
      } catch {
        /* network failure: fall through to the error below */
      }
    }
    if (!anilistId || !Number.isInteger(anilistId) || anilistId < 1) {
      console.error(`✖ "${animeTitle}": no AniList ID. Pass --anilist-id <id> or add an anilistId column.`);
      failed = true;
      continue;
    }
    const clash = existingAll.find((d) => d.anilistId === anilistId && d.slug !== slug);
    if (clash) {
      console.error(`✖ "${animeTitle}": AniList ID ${anilistId} already belongs to "${clash.title}" (${clash.slug}).`);
      failed = true;
      continue;
    }

    const result = buildDataset(rows, {
      title,
      slug,
      anilistId,
      alternativeTitles: values.alt ?? [],
      source: values.source,
      existing,
      mode: values.replace ? 'replace' : 'merge',
    });
    const outputPath = relative(ROOT, datasetPath(slug));
    results.push({ result, outputPath, anilistIdSource });

    if (!values['dry-run']) {
      mkdirSync(DATASET_DIR, { recursive: true });
      writeFileSync(datasetPath(slug), serializeDataset(result.dataset));
    }
  }

  if (!values['dry-run'] && results.length) writeCatalog(buildCatalog(listDatasets()));

  const report = buildReport({
    file,
    totalRecords: parsed.records.length,
    parseErrors: parsed.errors,
    rejected: validation.rejected,
    unknownColumns: validation.unknownColumns,
    results,
    dryRun: values['dry-run'],
  });
  const reportPath =
    values.report ?? join(ROOT, 'reports', `import-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  mkdirSync(join(reportPath, '..'), { recursive: true });
  writeFileSync(reportPath, report);

  console.log(report);
  console.log(`Report saved to ${relative(ROOT, reportPath)}`);

  const rejectedCount = validation.rejected.length + parsed.errors.length;
  if (failed || results.length === 0) return 1;
  if (values.strict && rejectedCount > 0) return 1;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
