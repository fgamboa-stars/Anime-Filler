#!/usr/bin/env tsx
/**
 * Checks the season splits made by afl:import.
 *
 *   npm run afl:verify                 # every show imported by the helper
 *   npm run afl:verify -- toradora     # specific shows
 *
 * AnimeFillerList numbers episodes continuously; afl:import splits that list into AniList's
 * seasons by episode count. If the two sources count a recap or special differently, every
 * later episode would be filed one off. This compares each season's episode titles with the
 * titles AniList lists from streaming services and reports seasons whose titles only line up
 * when shifted. Writes reports/afl-verify.md and exits with 1 if any season looks shifted.
 *
 *   npm run afl:verify -- --quarantine
 *
 * With --quarantine (used by the weekly sync), a shifted show whose guides are all new (not
 * yet committed to git) is set aside instead: its guides and seed CSVs are deleted and the
 * manifest marks it skipped, so the rest of the run can go on. Shifted guides that are
 * already committed still fail the run, since deleting them would lose reviewed data.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseStreamingTitles, verifySeasonTitles, type SplitVerdict } from './lib/afl.ts';
import { ROOT, buildCatalog, datasetPath, listDatasets, writeCatalog } from './lib/catalog.ts';
import { readManifest, upsert, writeManifest } from './lib/manifest.ts';
import { getStreamingTitles } from './lib/sources.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { quarantine: { type: 'boolean', default: false } },
});
const wanted = new Set(positionals);
const manifest = readManifest();
const shows = manifest.shows.filter((e) => e.imported?.length && e.seasons?.length && (!wanted.size || wanted.has(e.afl)));

const seasons = shows.flatMap((show) =>
  show.imported!.map((slug, i) => ({ afl: show.afl, show: show.name, slug, anilistId: show.seasons![i]?.anilistId })),
);
// Every matched season must have its own guide (catches two seasons written to one slug).
const missing = seasons.filter((s, i) => {
  const path = join(ROOT, 'src', 'data', 'anime', `${s.slug}.json`);
  const dup = seasons.findIndex((o) => o.slug === s.slug) !== i;
  try {
    return dup || (JSON.parse(readFileSync(path, 'utf8')) as { anilistId: number }).anilistId !== s.anilistId;
  } catch {
    return true;
  }
});
for (const s of missing) console.log(`✖ ${s.show}: AniList ${s.anilistId} has no guide of its own (${s.slug})`);
if (missing.length) {
  process.exitCode = 1;
  process.exit();
}

console.log(`Checking ${seasons.length} season(s) of ${shows.length} show(s) against AniList streaming titles…`);
const streaming = await getStreamingTitles(seasons.map((s) => s.anilistId).filter(Boolean));
// AniList often attaches one season's streaming list to every season of a franchise
// (Food Wars, Index). A list shared by several entries says nothing about any of them.
const listKey = (titles: string[]) => titles.join('\n');
const owners = new Map<string, number>();
for (const titles of streaming.values()) if (titles.length) owners.set(listKey(titles), (owners.get(listKey(titles)) ?? 0) + 1);
for (const [id, titles] of streaming) if ((owners.get(listKey(titles)) ?? 0) > 1) streaming.set(id, []);

const results: { afl: string; show: string; slug: string; verdict: SplitVerdict }[] = [];
for (const s of seasons) {
  const dataset = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'anime', `${s.slug}.json`), 'utf8')) as {
    episodes: { number: number; title: string }[];
  };
  results.push({ afl: s.afl, show: s.show, slug: s.slug, verdict: verifySeasonTitles(dataset.episodes, parseStreamingTitles(streaming.get(s.anilistId) ?? [])) });
}

const count = (status: SplitVerdict['status']) => results.filter((r) => r.verdict.status === status);
const describe = (v: SplitVerdict) =>
  v.status === 'no-data'
    ? 'AniList has no usable streaming titles'
    : `${v.matched}/${v.compared} titles match${v.status === 'shifted' ? `, but they line up when moved by ${v.shift > 0 ? '+' : ''}${v.shift}` : ''}`;

/** True when git knows the file. If git can't be asked, assume it does, so nothing is deleted. */
function isCommitted(path: string): boolean {
  const run = spawnSync('git', ['ls-files', '--', path], { cwd: ROOT, encoding: 'utf8' });
  return run.status !== 0 || run.stdout.trim() !== '';
}

// Set aside shows whose every guide is new in this run and at least one season is shifted.
const setAside: { show: string; slugs: string[]; detail: string }[] = [];
if (values.quarantine) {
  for (const afl of new Set(count('shifted').map((r) => r.afl))) {
    const entry = shows.find((s) => s.afl === afl)!;
    const slugs = entry.imported!;
    if (slugs.some((slug) => isCommitted(datasetPath(slug)))) continue;
    const detail = results
      .filter((r) => r.afl === afl && r.verdict.status === 'shifted')
      .map((r) => `${r.slug}: ${describe(r.verdict)}`)
      .join('; ');
    for (const slug of slugs) {
      rmSync(datasetPath(slug), { force: true });
      rmSync(join(ROOT, 'data', 'seed', `${slug}.csv`), { force: true });
    }
    upsert(manifest, {
      ...entry,
      status: 'skipped',
      reason: `season split looks shifted (${detail}); set status to "manual" with corrected seasons to import it`,
      imported: undefined,
    });
    setAside.push({ show: entry.name, slugs, detail });
  }
  if (setAside.length) {
    writeManifest(manifest);
    writeCatalog(buildCatalog(listDatasets()));
  }
}
const asideSlugs = new Set(setAside.flatMap((s) => s.slugs));
const blocking = count('shifted').filter((r) => !asideSlugs.has(r.slug));

const lines = [
  '# AnimeFillerList season split check',
  '',
  `- OK: ${count('ok').length}`,
  `- Shifted (needs a look): ${blocking.length}`,
  ...(setAside.length ? [`- Set aside (new and shifted, not imported): ${setAside.map((s) => s.show).join(', ')}`] : []),
  `- Unclear (titles differ, often just different translations): ${count('unclear').length}`,
  `- No usable streaming titles on AniList (none, or the same list on several seasons): ${count('no-data').length}`,
  '',
  '| Status | Show | Guide | Detail |',
  '| --- | --- | --- | --- |',
  ...results
    .filter((r) => r.verdict.status !== 'ok' && !asideSlugs.has(r.slug))
    .sort((a, b) => a.verdict.status.localeCompare(b.verdict.status) || a.slug.localeCompare(b.slug))
    .map((r) => `| ${r.verdict.status} | ${r.show} | \`${r.slug}\` | ${describe(r.verdict)} |`),
];
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'afl-verify.md'), lines.join('\n') + '\n');

for (const r of blocking) console.log(`✖ ${r.slug}: ${describe(r.verdict)}`);
for (const s of setAside) {
  console.log(`⚠ Set aside ${s.show} (${s.slugs.join(', ')}): ${s.detail}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::Set aside ${s.show}: season split looks shifted. Fix it by hand in data/afl/manifest.json.`);
}
if (setAside.length && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '### Shows set aside',
      '',
      'These were imported this week but their episode numbering looks shifted against AniList, so they were left out:',
      '',
      ...setAside.map((s) => `- **${s.show}** — ${s.detail}`),
      '',
    ].join('\n'),
  );
}
console.log(
  `\nOK ${count('ok').length}, shifted ${blocking.length}, set aside ${setAside.length}, unclear ${count('unclear').length}, no data ${count('no-data').length}. Report: reports/afl-verify.md`,
);
process.exitCode = blocking.length ? 1 : 0;
