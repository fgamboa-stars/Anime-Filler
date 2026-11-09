#!/usr/bin/env tsx
/**
 * Step 1 of the AnimeFillerList helper: match AnimeFillerList shows to AniList.
 *
 *   npm run afl:match                      # every show not checked yet
 *   npm run afl:match -- toradora death-parade
 *   npm run afl:match -- --limit 20
 *
 * A show is matched only when AniList's TV seasons add up to exactly the number
 * of episodes AnimeFillerList lists and every one of those seasons has finished
 * airing. Results go to data/afl/manifest.json; nothing is imported yet.
 */
import { parseArgs } from 'node:util';
import { isContiguous, isNonSeriesListing, parseAflIndex, parseAflShow, searchTermsFor, titleMatchScore } from './lib/afl.ts';
import { listDatasets } from './lib/catalog.ts';
import { readManifest, upsert, writeManifest, type ManifestEntry } from './lib/manifest.ts';
import { displayName, fetchAflPage, resolveChain, searchSeries, type AniListMedia } from './lib/sources.ts';

/** How much of the show's name the first matched season's title must contain (see titleMatchScore). */
const MIN_TITLE_SCORE = 0.5;

const HELP = `
Usage: npm run afl:match -- [afl-slug ...] [options]

  afl-slug        Show path on animefillerlist.com (the part after /shows/). Default: every show.
  --retry         Re-check shows already in the manifest (manual entries are always kept)
  --refresh       Download pages again instead of using .cache/afl/
  --limit <n>     Stop after checking n shows
  -h, --help      Show this help
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      retry: { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const index = parseAflIndex((await fetchAflPage('shows', { refresh: values.refresh })) ?? '');
  if (!index.length) throw new Error('Could not read the AnimeFillerList show index.');
  const manifest = readManifest();
  const done = new Set(manifest.shows.filter((s) => s.status === 'manual' || !values.retry).map((s) => s.afl));

  // Shows named on the command line are always (re)checked, unless set by hand.
  let queue = positionals.length
    ? positionals
        .map((slug) => index.find((e) => e.slug === slug) ?? { slug, name: slug })
        .filter((e) => manifest.shows.find((s) => s.afl === e.slug)?.status !== 'manual')
    : index.filter((e) => !done.has(e.slug));
  if (values.limit) queue = queue.slice(0, Number(values.limit));

  const taken = new Map<number, string>();
  for (const d of listDatasets()) taken.set(d.anilistId, `already in the catalog as "${d.title}"`);
  const queued = new Set(queue.map((e) => e.slug));
  for (const d of listDatasets())
    if (manifest.shows.some((s) => queued.has(s.afl) && s.imported?.includes(d.slug))) taken.delete(d.anilistId);
  for (const s of manifest.shows)
    if (s.status !== 'skipped' && !queued.has(s.afl)) for (const season of s.seasons ?? []) taken.set(season.anilistId, `already matched to AnimeFillerList "${s.name}"`);

  // Pages download one at a time in the background while AniList matching runs.
  let chain: Promise<unknown> = Promise.resolve();
  const pages = new Map<string, Promise<string | null>>();
  for (const e of queue) {
    if (isNonSeriesListing(e.name)) continue;
    const p = chain.then(() => fetchAflPage(`shows/${e.slug}`, { refresh: values.refresh }));
    chain = p.catch(() => undefined);
    pages.set(e.slug, p);
  }

  let matched = 0;
  let checked = 0;
  for (const e of queue) {
    checked++;
    const record = (entry: Omit<ManifestEntry, 'afl' | 'name' | 'checkedAt'>) => {
      upsert(manifest, { afl: e.slug, name: e.name, checkedAt: new Date().toISOString(), ...entry });
      writeManifest(manifest);
      const tag = entry.status === 'matched' ? '✔' : '·';
      console.log(`${tag} [${checked}/${queue.length}] ${e.name}: ${entry.reason ?? entry.seasons?.map((s) => `${s.title} (${s.episodes})`).join(' → ')}`);
    };

    if (isNonSeriesListing(e.name)) {
      record({ status: 'skipped', reason: 'film/OVA/special listing' });
      continue;
    }
    let html: string | null;
    try {
      html = await pages.get(e.slug)!;
    } catch (err) {
      record({ status: 'skipped', reason: `download failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    if (!html) {
      record({ status: 'skipped', reason: 'page not found' });
      continue;
    }
    const show = parseAflShow(html);
    if (!show.episodes.length) {
      record({ status: 'skipped', reason: 'page has no episode list' });
      continue;
    }
    if (show.skipped.length || !isContiguous(show.episodes)) {
      record({ status: 'skipped', episodes: show.episodes.length, reason: 'episode numbers are not a clean 1…n list' });
      continue;
    }

    const target = show.episodes.length;
    const tried = new Set<number>();
    let best: string | undefined;
    let found: AniListMedia[] | undefined;
    try {
      outer: for (const term of searchTermsFor(e.name)) {
        const candidates = (await searchSeries(term)).slice(0, 3);
        for (const [rank, candidate] of candidates.entries()) {
          if (tried.has(candidate.id)) continue;
          tried.add(candidate.id);
          const result = await resolveChain(candidate, target);
          for (const m of result.chain) tried.add(m.id);
          // When the best search hit is a show we already have, say so instead of reporting a count mismatch.
          const existing = [candidate, ...result.chain].map((m) => taken.get(m.id)).find(Boolean);
          if (existing && rank === 0) {
            best = existing;
            break outer;
          }
          const first = result.chain[0];
          if (!result.problem && first && titleMatchScore(e.name, [first.title.english, first.title.romaji, ...(first.synonyms ?? [])]) < MIN_TITLE_SCORE) {
            best ??= `episode total matches, but the first season (${displayName(first)}) has a different title`;
            continue;
          }
          if (!result.problem) {
            found = result.chain;
            break outer;
          }
          best ??= result.problem;
        }
      }
    } catch (err) {
      record({ status: 'skipped', episodes: target, reason: `AniList lookup failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    if (!found) {
      record({ status: 'skipped', episodes: target, reason: best ?? 'no AniList TV series found' });
      continue;
    }
    const clash = found.map((m) => taken.get(m.id)).find(Boolean);
    if (clash) {
      record({ status: 'skipped', episodes: target, reason: clash });
      continue;
    }
    const seasons = found.map((m) => ({ anilistId: m.id, title: displayName(m), episodes: m.episodes ?? 0 }));
    for (const s of seasons) taken.set(s.anilistId, `already matched to AnimeFillerList "${e.name}"`);
    record({ status: 'matched', episodes: target, seasons, reason: undefined });
    matched++;
  }

  console.log(`\nChecked ${checked} show(s), matched ${matched}. Manifest: data/afl/manifest.json`);
  console.log('Review the matches, then run: npm run afl:import');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
