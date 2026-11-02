// Shared by the app and the Node import scripts — keep imports relative and browser/Node neutral.
import type {
  Arc,
  CatalogEntry,
  DatasetEpisode,
  EpisodeRange,
  EpisodeType,
  EpisodeTypeCounts,
  FillerDataset,
  PreparedDataset,
} from '../types/index.ts';

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function emptyCounts(): EpisodeTypeCounts {
  return { CANON: 0, FILLER: 0, MIXED: 0, ANIME_CANON: 0 };
}

export function countTypes(episodes: Pick<DatasetEpisode, 'type'>[]): EpisodeTypeCounts {
  const counts = emptyCounts();
  for (const ep of episodes) counts[ep.type] += 1;
  return counts;
}

/** Collapse a list of episode numbers into contiguous ranges. */
export function toRanges(numbers: number[]): EpisodeRange[] {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const ranges: EpisodeRange[] = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last.end + 1) last.end = n;
    else ranges.push({ start: n, end: n });
  }
  return ranges;
}

export function formatRange(range: EpisodeRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
}

export function formatRanges(ranges: EpisodeRange[]): string {
  return ranges.map(formatRange).join(', ');
}

export function fillerPercentage(counts: EpisodeTypeCounts): number {
  const total = counts.CANON + counts.FILLER + counts.MIXED + counts.ANIME_CANON;
  if (total === 0) return 0;
  return Math.round((counts.FILLER / total) * 1000) / 10;
}

/** Derive arcs (in first-appearance order) from episode rows. */
export function deriveArcs(episodes: DatasetEpisode[]): Arc[] {
  const bySlug = new Map<string, Arc>();
  const sorted = [...episodes].sort((a, b) => a.number - b.number);
  for (const ep of sorted) {
    const slug = slugify(ep.arc) || 'unassigned';
    let arc = bySlug.get(slug);
    if (!arc) {
      arc = { slug, name: ep.arc, order: bySlug.size + 1, episodes: [], ranges: [], counts: emptyCounts() };
      bySlug.set(slug, arc);
    }
    arc.episodes.push(ep.number);
    arc.counts[ep.type] += 1;
  }
  for (const arc of bySlug.values()) arc.ranges = toRanges(arc.episodes);
  return [...bySlug.values()];
}

export function prepareDataset(dataset: FillerDataset): PreparedDataset {
  const episodes = [...dataset.episodes]
    .sort((a, b) => a.number - b.number)
    .map((ep) => ({ ...ep, arcSlug: slugify(ep.arc) || 'unassigned' }));
  return {
    ...dataset,
    episodes,
    arcs: deriveArcs(dataset.episodes),
    counts: countTypes(dataset.episodes),
  };
}

export function buildCatalogEntry(dataset: FillerDataset): CatalogEntry {
  const counts = countTypes(dataset.episodes);
  return {
    slug: dataset.slug,
    anilistId: dataset.anilistId,
    title: dataset.title,
    alternativeTitles: dataset.alternativeTitles,
    totalEpisodes: dataset.episodes.length,
    counts,
    fillerPercentage: fillerPercentage(counts),
    arcCount: deriveArcs(dataset.episodes).length,
    updatedAt: dataset.updatedAt,
  };
}

/** One episode per line keeps dataset diffs readable in pull requests. */
export function serializeDataset(dataset: FillerDataset): string {
  const { episodes, ...meta } = dataset;
  const head = JSON.stringify(meta, null, 2).replace(/\n}$/, '');
  const body = episodes.map((ep) => `    ${JSON.stringify(ep)}`).join(',\n');
  return `${head},\n  "episodes": [\n${body}\n  ]\n}\n`;
}

export const TYPE_LABELS: Record<EpisodeType, string> = {
  CANON: 'Canon',
  FILLER: 'Filler',
  MIXED: 'Mixed',
  ANIME_CANON: 'Anime canon',
};

/** URL-friendly values for episode types (`?type=filler,anime-canon`). */
export const TYPE_PARAMS: Record<EpisodeType, string> = {
  CANON: 'canon',
  FILLER: 'filler',
  MIXED: 'mixed',
  ANIME_CANON: 'anime-canon',
};

export function typeFromParam(value: string): EpisodeType | null {
  const v = value.trim().toLowerCase().replace(/_/g, '-');
  const match = (Object.entries(TYPE_PARAMS) as [EpisodeType, string][]).find(([, p]) => p === v);
  return match ? match[0] : null;
}
