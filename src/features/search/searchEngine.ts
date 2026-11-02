import Fuse, { type FuseResult, type IFuseOptions, type RangeTuple } from 'fuse.js';

/**
 * Fuzzy search over small, already-loaded lists only: AniList results for the
 * current query, the local dataset catalog and a short list of popular titles.
 * Nothing large is preloaded.
 */
export interface Searchable {
  /** Primary display title. */
  title: string;
  /** Other names: English/romaji/native titles and synonyms. */
  altTitles: string[];
}

export interface RankedItem<T> {
  item: T;
  score: number;
  /** Character ranges in `item.title` that matched, for highlighting. */
  highlights: RangeTuple[];
}

const FUSE_OPTIONS: IFuseOptions<Searchable> = {
  keys: [
    { name: 'title', weight: 0.65 },
    { name: 'altTitles', weight: 0.35 },
  ],
  includeScore: true,
  includeMatches: true,
  ignoreLocation: true,
  ignoreDiacritics: true,
  threshold: 0.4,
  minMatchCharLength: 2,
};

const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function titleHighlights<T extends Searchable>(result: FuseResult<T>): RangeTuple[] {
  return (result.matches ?? [])
    .filter((m) => m.key === 'title')
    .flatMap((m) => m.indices.filter(([a, b]) => b - a >= 1));
}

/**
 * Rank `items` against `query`. Each whitespace-separated word must match
 * somewhere (so "attak titan" finds "Attack on Titan"); the full phrase is
 * also tried, and the better score wins. Lower score = better.
 */
export function fuzzyRank<T extends Searchable>(query: string, items: T[], limit = 20): RankedItem<T>[] {
  const q = normalize(query);
  if (!q || items.length === 0) return [];
  const fuse = new Fuse(items, FUSE_OPTIONS);
  const scores = new Map<number, { score: number; highlights: RangeTuple[] }>();

  const record = (idx: number, score: number, highlights: RangeTuple[]) => {
    const prev = scores.get(idx);
    if (!prev || score < prev.score) scores.set(idx, { score, highlights });
  };

  for (const r of fuse.search(q)) record(r.refIndex, r.score ?? 1, titleHighlights(r));

  const tokens = q.split(' ').filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    const perToken = tokens.map((t) => new Map(fuse.search(t).map((r) => [r.refIndex, r] as const)));
    const [first, ...rest] = perToken;
    for (const [idx, r] of first) {
      if (!rest.every((m) => m.has(idx))) continue;
      const all = [r, ...rest.map((m) => m.get(idx)!)];
      const avg = all.reduce((s, x) => s + (x.score ?? 1), 0) / all.length;
      // Small penalty so an exact whole-phrase match still ranks first.
      record(idx, Math.min(1, avg + 0.02), all.flatMap(titleHighlights));
    }
  }

  // Prefix/substring boost: "shipp" should put "Naruto Shippuden" first.
  items.forEach((item, idx) => {
    const names = [item.title, ...item.altTitles].map(normalize);
    const hl = () => {
      const existing = scores.get(idx)?.highlights ?? [];
      if (existing.length) return existing;
      const at = item.title.toLowerCase().indexOf(q);
      return at >= 0 ? ([[at, at + q.length - 1]] as RangeTuple[]) : [];
    };
    if (names.some((n) => n === q)) record(idx, 0, hl());
    else if (names.some((n) => n.startsWith(q))) record(idx, 0.001, hl());
    else if (names.some((n) => n.split(' ').some((w) => w.startsWith(q)))) record(idx, 0.01, hl());
  });

  return [...scores.entries()]
    .sort((a, b) => a[1].score - b[1].score || a[0] - b[0])
    .slice(0, limit)
    .map(([idx, { score, highlights }]) => ({ item: items[idx], score, highlights: mergeRanges(highlights) }));
}

/** Best spelling correction for a query from a pool of known titles. */
export function suggestCorrection(query: string, pool: string[]): string | null {
  const q = normalize(query);
  if (q.length < 3) return null;
  const [best] = fuzzyRank(
    q,
    pool.map((title) => ({ title, altTitles: [] })),
    1,
  );
  if (!best || best.score > 0.45) return null;
  return normalize(best.item.title) === q ? null : best.item.title;
}

/**
 * Re-rank a remote result list with Fuse, keeping anything Fuse didn't match
 * (AniList also matches on data we don't have, e.g. character names) in its
 * original order after the fuzzy matches.
 */
export function rankResults<T extends Searchable>(query: string, items: T[]): RankedItem<T>[] {
  const ranked = fuzzyRank(query, items, items.length);
  const seen = new Set(ranked.map((r) => r.item));
  const rest = items.filter((i) => !seen.has(i)).map((item) => ({ item, score: 1, highlights: [] as RangeTuple[] }));
  return [...ranked, ...rest];
}

export function mergeRanges(ranges: RangeTuple[]): RangeTuple[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: RangeTuple[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
