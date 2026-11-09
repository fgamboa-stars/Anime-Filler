/**
 * Helpers for turning AnimeFillerList.com show pages into importer CSVs.
 *
 * Only pure functions live here (parsing, splitting, CSV output) so they can be
 * unit-tested without the network. Fetching and AniList matching live in
 * scripts/lib/sources.ts.
 */
import type { EpisodeType } from '../../src/types/index.ts';
import { normalizeType } from './importer.ts';

export const AFL_ORIGIN = 'https://www.animefillerlist.com';

export interface AflIndexEntry {
  /** Path segment after /shows/, still URL-encoded (e.g. "pok%C3%A9mon-journeys"). */
  slug: string;
  name: string;
}

export interface AflEpisode {
  number: number;
  title: string;
  type: EpisodeType;
}

export interface AflShow {
  title: string;
  episodes: AflEpisode[];
  /** Rows that could not be read (non-integer numbers, unknown types). */
  skipped: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Every show linked from https://www.animefillerlist.com/shows. */
export function parseAflIndex(html: string): AflIndexEntry[] {
  const out: AflIndexEntry[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a href="\/shows\/([^"/?#]+)">([^<]+)<\/a>/g)) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: decodeEntities(m[2]).trim() });
  }
  return out;
}

/** Films, OVAs and specials are listed separately on AniList and are not TV guides. */
export function isNonSeriesListing(name: string): boolean {
  return /\b(films?|movies?|ovas?|oads?|specials?)\b/i.test(name);
}

/** "Assassination Classroom (Ansatsu Kyoushitsu)" → ["Assassination Classroom", "Ansatsu Kyoushitsu"]. */
export function searchTermsFor(name: string): string[] {
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const terms = m ? [m[1], m[2]] : [name];
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

const TITLE_STOPWORDS = new Set(['the', 'a', 'of', 'no', 'wa', 'to', 'ni', 'ga', 'wo', 'and', 'season', 'tv']);

function titleWords(title: string): string[] {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ou/g, 'o')
    .replace(/uu/g, 'u')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !TITLE_STOPWORDS.has(w));
}

/**
 * Share of the AnimeFillerList name's words (0–1) found in the best of `titles`, using
 * the name's English and alternative parts. Lenient about romanization ("Buso"/"Busou").
 * Used to reject chains whose episode total only matches by coincidence.
 */
export function titleMatchScore(aflName: string, titles: (string | null | undefined)[]): number {
  let best = 0;
  for (const term of searchTermsFor(aflName)) {
    const words = titleWords(term);
    if (!words.length) continue;
    for (const title of titles) {
      if (!title) continue;
      const have = new Set(titleWords(title));
      best = Math.max(best, words.filter((w) => have.has(w)).length / words.length);
    }
  }
  return best;
}

/** Reads the episode table of a show page. */
export function parseAflShow(html: string): AflShow {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1 ? stripTags(h1[1]).replace(/\s*Filler List\s*$/i, '') : '';
  const episodes: AflEpisode[] = [];
  const skipped: string[] = [];
  const table = html.match(/<table class="EpisodeList">([\s\S]*?)<\/table>/);
  if (!table) return { title, episodes, skipped };

  for (const row of table[1].matchAll(/<tr[^>]*id="eps-[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cell = (cls: string) => row[1].match(new RegExp(`<td class="${cls}"[^>]*>([\\s\\S]*?)</td>`))?.[1];
    const numberText = stripTags(cell('Number') ?? '');
    const typeText = stripTags(cell('Type') ?? '');
    const number = Number(numberText);
    const type = normalizeType(typeText);
    // "Episode 0" is a pre-series special that AniList lists as its own entry.
    if (numberText === '0') continue;
    if (!/^\d+$/.test(numberText) || number < 1) {
      skipped.push(`episode "${numberText}" is not a whole number`);
      continue;
    }
    if (!type) {
      skipped.push(`episode ${number} has unknown type "${typeText}"`);
      continue;
    }
    episodes.push({ number, title: stripTags(cell('Title') ?? '') || `Episode ${number}`, type });
  }
  episodes.sort((a, b) => a.number - b.number);
  return { title, episodes, skipped };
}

/** True when episodes are exactly 1..n with no gaps or repeats. */
export function isContiguous(episodes: AflEpisode[]): boolean {
  return episodes.every((ep, i) => ep.number === i + 1);
}

/**
 * Splits one continuous AnimeFillerList numbering across consecutive AniList
 * entries (seasons), renumbering each part from 1.
 */
export function splitSeasons(episodes: AflEpisode[], counts: number[]): { offset: number; episodes: AflEpisode[] }[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== episodes.length) throw new Error(`season counts add up to ${total}, but the list has ${episodes.length} episodes`);
  const parts: { offset: number; episodes: AflEpisode[] }[] = [];
  let offset = 0;
  for (const count of counts) {
    parts.push({ offset, episodes: episodes.slice(offset, offset + count).map((ep, i) => ({ ...ep, number: i + 1 })) });
    offset += count;
  }
  return parts;
}

/** English title unless it is shouted in capitals ("VINLAND SAGA") and a romaji title exists. */
export function pickTitle(english: string | null, romaji: string | null): string {
  if (english && (english !== english.toUpperCase() || !romaji)) return english;
  return romaji ?? english ?? '';
}

/**
 * Label of one season inside a franchise: "Season 1" for the first, otherwise
 * what the title adds after the franchise name ("Kyoto Saga", "Season 2").
 */
export function seasonLabelFor(title: string, prefixes: string[], index: number): string {
  if (index === 0) return 'Season 1';
  const lower = title.toLowerCase();
  for (const prefix of [...prefixes].sort((a, b) => b.length - a.length)) {
    if (prefix && lower.startsWith(prefix.toLowerCase())) {
      const rest = title.slice(prefix.length).replace(/^[\s:–—\-.,!]+/, '').trim();
      if (rest) return rest;
    }
  }
  return `Season ${index + 1}`;
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV in the importer's format (arcs are left empty → "Standalone Episodes"). */
export function toImporterCsv(animeTitle: string, anilistId: number, episodes: AflEpisode[]): string {
  const lines = ['animeTitle,episodeNumber,title,type,arc,anilistId'];
  for (const ep of episodes) lines.push([animeTitle, ep.number, ep.title, ep.type, '', anilistId].map(csvField).join(','));
  return `${lines.join('\n')}\n`;
}
