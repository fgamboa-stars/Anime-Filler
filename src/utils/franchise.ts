import type { CatalogEntry, EpisodeType, EpisodeTypeCounts } from '../types/index.ts';
import { decodeStrip, emptyCounts, fillerPercentage } from './dataset.ts';

/** One card's worth of guides: a single series, or every season of a franchise. */
export interface FranchiseGroup {
  key: string;
  title: string;
  /** Seasons in watch order (a single entry for standalone series). */
  entries: CatalogEntry[];
  first: CatalogEntry;
  totalEpisodes: number;
  counts: EpisodeTypeCounts;
  fillerPercentage: number;
}

export function seasonLabel(entry: CatalogEntry): string {
  return entry.seasonLabel ?? entry.title;
}

export function groupCatalog(entries: CatalogEntry[]): FranchiseGroup[] {
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const key = entry.franchise ?? entry.slug;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => (a.franchiseOrder ?? 0) - (b.franchiseOrder ?? 0) || a.title.localeCompare(b.title));
    const counts = emptyCounts();
    for (const e of sorted) for (const t of Object.keys(counts) as EpisodeType[]) counts[t] += e.counts[t];
    const totalEpisodes = sorted.reduce((n, e) => n + e.totalEpisodes, 0);
    return {
      key,
      title: sorted[0].franchise ?? sorted[0].title,
      entries: sorted,
      first: sorted[0],
      totalEpisodes,
      counts,
      fillerPercentage: fillerPercentage(counts),
    };
  });
}

/** All seasons of a franchise drawn as one continuous strip. */
export function groupStrip(group: FranchiseGroup): { number: number; type: EpisodeType }[] {
  const out: { number: number; type: EpisodeType }[] = [];
  for (const entry of group.entries) for (const ep of decodeStrip(entry.strip)) out.push({ number: out.length + 1, type: ep.type });
  return out;
}

export function franchiseSiblings(entries: CatalogEntry[], entry: CatalogEntry): CatalogEntry[] {
  if (!entry.franchise) return [];
  return entries.filter((e) => e.franchise === entry.franchise).sort((a, b) => (a.franchiseOrder ?? 0) - (b.franchiseOrder ?? 0));
}

/** Shown first on the home page and guide list; everything else follows alphabetically. */
const FEATURED_ORDER = [
  'naruto',
  'naruto-shippuden',
  'one-piece',
  'bleach',
  'dragon-ball-z',
  'My Hero Academia',
  'Attack on Titan',
  'Demon Slayer',
  'Jujutsu Kaisen',
];

/** Franchise groups in display order: featured series first, then A–Z. */
export function featuredGroups(catalog: CatalogEntry[]): FranchiseGroup[] {
  const rank = (key: string) => {
    const i = FEATURED_ORDER.indexOf(key);
    return i === -1 ? FEATURED_ORDER.length : i;
  };
  return groupCatalog(catalog).sort((a, b) => rank(a.key) - rank(b.key) || a.title.localeCompare(b.title));
}
