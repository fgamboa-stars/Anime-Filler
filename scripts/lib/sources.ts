/**
 * Network access for the AnimeFillerList helper, written to be polite:
 *
 * - AnimeFillerList: one request at a time, at least 10 s apart (the delay its
 *   robots.txt asks for), and every page is cached under .cache/afl/ so a page
 *   is downloaded once no matter how often the scripts run.
 * - AniList: at most ~25 requests a minute (the API allows 30), with Retry-After
 *   honoured on 429. Only IDs, titles, status and episode counts are requested.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './catalog.ts';
import { AFL_ORIGIN } from './afl.ts';

const USER_AGENT = 'AnimeFillerFinder-importer/1.0 (+https://github.com/fgamboa-stars/Anime-Filler)';
const AFL_DELAY_MS = 10_000;
const ANILIST_DELAY_MS = 2_400;
export const CACHE_DIR = join(ROOT, '.cache', 'afl');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastAflRequest = 0;

/** Returns the page HTML, from cache when possible. `null` when the page does not exist. */
export async function fetchAflPage(path: string, { refresh = false } = {}): Promise<string | null> {
  const file = join(CACHE_DIR, `${decodeURIComponent(path).replace(/[^a-z0-9-]+/gi, '_') || 'index'}.html`);
  if (!refresh && existsSync(file)) return readFileSync(file, 'utf8');

  const wait = lastAflRequest + AFL_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAflRequest = Date.now();

  const res = await fetch(`${AFL_ORIGIN}/${path}`, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AnimeFillerList answered ${res.status} for /${path}`);
  const html = await res.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, html);
  return html;
}

// ── AniList ────────────────────────────────────────────────────────────────

export interface AniListMedia {
  id: number;
  type: 'ANIME' | 'MANGA';
  format: string | null;
  status: string | null;
  episodes: number | null;
  title: { romaji: string | null; english: string | null };
  synonyms?: string[];
  relations?: { edges: { relationType: string; node: { id: number; type: string; format: string | null } }[] };
}

const MEDIA_FIELDS = `id type format status episodes title { romaji english } synonyms
  relations { edges { relationType node { id type format } } }`;

/** Formats that count as a TV season. Films, OVAs and specials are separate guides. */
export const SERIES_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

let lastAniListRequest = 0;
const mediaCache = new Map<number, AniListMedia>();

async function anilist<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const wait = lastAniListRequest + ANILIST_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAniListRequest = Date.now();

  const res = await fetch(process.env.VITE_ANILIST_API ?? 'https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && attempt < 3) {
    const retry = Number(res.headers.get('Retry-After')) || 60;
    console.warn(`  AniList rate limit reached, waiting ${retry}s…`);
    await sleep(retry * 1000);
    return anilist(query, variables, attempt + 1);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || !json.data) throw new Error(`AniList error: ${json.errors?.map((e) => e.message).join('; ') ?? res.status}`);
  return json.data;
}

export async function getMedia(ids: number[]): Promise<AniListMedia[]> {
  const missing = [...new Set(ids)].filter((id) => !mediaCache.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    const data = await anilist<{ Page: { media: AniListMedia[] } }>(
      `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${MEDIA_FIELDS} } } }`,
      { ids: missing.slice(i, i + 50) },
    );
    for (const m of data.Page.media) mediaCache.set(m.id, m);
  }
  return ids.map((id) => mediaCache.get(id)).filter((m): m is AniListMedia => Boolean(m));
}

export async function searchSeries(term: string): Promise<AniListMedia[]> {
  const data = await anilist<{ Page: { media: AniListMedia[] } }>(
    `query ($s: String) { Page(perPage: 6) { media(search: $s, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`,
    { s: term },
  );
  for (const m of data.Page.media) mediaCache.set(m.id, m);
  return data.Page.media.filter((m) => m.format && SERIES_FORMATS.has(m.format));
}

function relative(media: AniListMedia, relationType: 'PREQUEL' | 'SEQUEL'): number | undefined {
  return media.relations?.edges.find(
    (e) => e.relationType === relationType && e.node.type === 'ANIME' && e.node.format && SERIES_FORMATS.has(e.node.format),
  )?.node.id;
}

export interface ChainResult {
  chain: AniListMedia[];
  /** Why the candidate was rejected; undefined on success. */
  problem?: string;
}

/**
 * Starting from any season of a show, walks back to its first TV season, then
 * forward through sequels until the episode counts add up to `target`.
 * Succeeds only on an exact total, and only when every season has finished.
 */
/**
 * Finds consecutive TV seasons (following SEQUEL edges) whose episode counts add up to `target`.
 * The chain may start at `start` (tried first) or at one of its prequels, but it must include `start` itself,
 * so an unrelated earlier entry (Fate/Zero for Unlimited Blade Works) can't match by coincidence.
 */
export async function resolveChain(start: AniListMedia, target: number): Promise<ChainResult> {
  const ancestors: AniListMedia[] = [start];
  for (let i = 0; i < 20; i++) {
    const prev = relative(ancestors[0], 'PREQUEL');
    if (!prev) break;
    const [m] = await getMedia([prev]);
    if (!m) break;
    ancestors.unshift(m);
  }

  let best: ChainResult | undefined;
  // Closest start first: the searched show itself, then each earlier prequel.
  for (const first of [...ancestors].reverse()) {
    const chain: AniListMedia[] = [];
    let total = 0;
    let current: AniListMedia | undefined = first;
    let problem: string | undefined;
    while (current && total < target && chain.length < 40) {
      if (current.episodes == null) {
        problem = `AniList has no episode count for ${current.id}`;
        break;
      }
      chain.push(current);
      total += current.episodes;
      const next = relative(current, 'SEQUEL');
      current = next ? (await getMedia([next]))[0] : undefined;
    }
    if (!problem && total !== target) problem = `AniList seasons add up to ${total} episodes, AnimeFillerList lists ${target}`;
    if (!problem && !chain.some((m) => m.id === start.id)) problem = `AniList seasons add up to ${target} episodes only without ${displayName(start)}`;
    if (!problem) {
      const unfinished = chain.find((m) => m.status !== 'FINISHED');
      if (unfinished) return { chain, problem: `${displayName(unfinished)} is ${unfinished.status ?? 'unknown status'} on AniList` };
      return { chain };
    }
    best ??= { chain, problem };
  }
  return best ?? { chain: [], problem: 'no seasons found' };
}

export function displayName(m: Pick<AniListMedia, 'title'>): string {
  return m.title.english ?? m.title.romaji ?? 'Untitled';
}
