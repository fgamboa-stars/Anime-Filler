/** Core vocabulary shared by every layer. Nothing in here may depend on the database or HTTP. */

export const CATEGORIES = ['CANON', 'MIXED', 'FILLER', 'ANIME_CANON', 'OVA', 'SPECIAL', 'MOVIE'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  CANON: 'Canon',
  MIXED: 'Mixed Canon/Filler',
  FILLER: 'Filler',
  ANIME_CANON: 'Anime Canon',
  OVA: 'OVA',
  SPECIAL: 'Special',
  MOVIE: 'Movie',
};

export type Distribution = Record<Category, number>;

/**
 * HIGH: a human reviewed it. MEDIUM: curated third-party label, imported rather than reviewed.
 * LOW: the system's own prediction, including auto-approved ones.
 */
export type TrustLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ReviewStatus = 'UNREVIEWED' | 'APPROVED' | 'OVERRIDDEN';
export type Decision = 'AUTO_APPROVED' | 'SUGGESTED' | 'NEEDS_REVIEW';
export type Origin = 'engine' | 'human' | 'import';

export const CONTRIBUTORS = ['rules', 'similarity', 'arc', 'series', 'tags'] as const;
export type ContributorName = (typeof CONTRIBUTORS)[number];

export interface MediaTag {
  name: string;
  rank: number;
}

export interface AnimeMeta {
  /** AniList Media ID. */
  id: number;
  title: string;
  format: string | null;
  source: string | null;
  status: string | null;
  seasonYear: number | null;
  totalEpisodes: number | null;
  genres: string[];
  tags: MediaTag[];
  studios: string[];
  characters: string[];
  /** PREQUEL / SEQUEL / PARENT relations, used to borrow a profile for a new season. */
  relatedAnimeIds: number[];
}

export interface EpisodeInput {
  animeId: number;
  number: number;
  title: string | null;
  description: string | null;
  /** Named story arc, when known. AniList has no arcs, so freshly imported episodes have none. */
  arc: string | null;
  /** Episode-level tags: detected from text or added by a reviewer. */
  tags: string[];
}

/** A previously classified episode, usable as evidence. */
export interface LabeledEpisode {
  animeId: number;
  number: number;
  title: string | null;
  arc: string | null;
  category: Category;
  trust: TrustLevel;
  reviewStatus: ReviewStatus;
}

export function emptyDistribution(): Distribution {
  return { CANON: 0, MIXED: 0, FILLER: 0, ANIME_CANON: 0, OVA: 0, SPECIAL: 0, MOVIE: 0 };
}

/** Normalizes in place. An all-zero input stays all-zero, which callers read as "no evidence". */
export function normalize(dist: Distribution): Distribution {
  const total = CATEGORIES.reduce((sum, c) => sum + dist[c], 0);
  if (total > 0) for (const c of CATEGORIES) dist[c] /= total;
  return dist;
}

export function topCategory(dist: Distribution): Category {
  let best: Category = 'CANON';
  for (const c of CATEGORIES) if (dist[c] > dist[best]) best = c;
  return best;
}
