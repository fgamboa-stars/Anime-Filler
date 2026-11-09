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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseStreamingTitles, verifySeasonTitles, type SplitVerdict } from './lib/afl.ts';
import { ROOT } from './lib/catalog.ts';
import { readManifest } from './lib/manifest.ts';
import { getStreamingTitles } from './lib/sources.ts';

const { positionals } = parseArgs({ allowPositionals: true });
const wanted = new Set(positionals);
const shows = readManifest().shows.filter((e) => e.imported?.length && e.seasons?.length && (!wanted.size || wanted.has(e.afl)));

const seasons = shows.flatMap((show) =>
  show.imported!.map((slug, i) => ({ show: show.name, slug, anilistId: show.seasons![i]?.anilistId })),
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

const results: { show: string; slug: string; verdict: SplitVerdict }[] = [];
for (const s of seasons) {
  const dataset = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'anime', `${s.slug}.json`), 'utf8')) as {
    episodes: { number: number; title: string }[];
  };
  results.push({ show: s.show, slug: s.slug, verdict: verifySeasonTitles(dataset.episodes, parseStreamingTitles(streaming.get(s.anilistId) ?? [])) });
}

const count = (status: SplitVerdict['status']) => results.filter((r) => r.verdict.status === status);
const describe = (v: SplitVerdict) =>
  v.status === 'no-data'
    ? 'AniList has no usable streaming titles'
    : `${v.matched}/${v.compared} titles match${v.status === 'shifted' ? `, but they line up when moved by ${v.shift > 0 ? '+' : ''}${v.shift}` : ''}`;

const lines = [
  '# AnimeFillerList season split check',
  '',
  `- OK: ${count('ok').length}`,
  `- Shifted (needs a look): ${count('shifted').length}`,
  `- Unclear (titles differ, often just different translations): ${count('unclear').length}`,
  `- No usable streaming titles on AniList (none, or the same list on several seasons): ${count('no-data').length}`,
  '',
  '| Status | Show | Guide | Detail |',
  '| --- | --- | --- | --- |',
  ...results
    .filter((r) => r.verdict.status !== 'ok')
    .sort((a, b) => a.verdict.status.localeCompare(b.verdict.status) || a.slug.localeCompare(b.slug))
    .map((r) => `| ${r.verdict.status} | ${r.show} | \`${r.slug}\` | ${describe(r.verdict)} |`),
];
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'afl-verify.md'), lines.join('\n') + '\n');

for (const r of count('shifted')) console.log(`✖ ${r.slug}: ${describe(r.verdict)}`);
console.log(
  `\nOK ${count('ok').length}, shifted ${count('shifted').length}, unclear ${count('unclear').length}, no data ${count('no-data').length}. Report: reports/afl-verify.md`,
);
process.exitCode = count('shifted').length ? 1 : 0;
