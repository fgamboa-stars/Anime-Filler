/** Classification of a single episode. */
export type EpisodeType = 'CANON' | 'FILLER' | 'MIXED' | 'ANIME_CANON';

export const EPISODE_TYPES: readonly EpisodeType[] = ['CANON', 'MIXED', 'ANIME_CANON', 'FILLER'] as const;

export type EpisodeTypeCounts = Record<EpisodeType, number>;

/** Episode as stored in a dataset JSON file. */
export interface DatasetEpisode {
  number: number;
  title: string;
  type: EpisodeType;
  arc: string;
}

/** Filler dataset as stored in `src/data/anime/<slug>.json`. */
export interface FillerDataset {
  schemaVersion: 1;
  slug: string;
  /** AniList Media ID — the link between metadata and filler data. */
  anilistId: number;
  title: string;
  alternativeTitles: string[];
  totalEpisodes: number;
  source?: string;
  updatedAt: string;
  episodes: DatasetEpisode[];
}

/** Episode enriched at runtime. */
export interface Episode extends DatasetEpisode {
  arcSlug: string;
}

export interface EpisodeRange {
  start: number;
  end: number;
}

export interface Arc {
  slug: string;
  name: string;
  /** Position of the arc in broadcast order (1-based). */
  order: number;
  episodes: number[];
  ranges: EpisodeRange[];
  counts: EpisodeTypeCounts;
}

export interface PreparedDataset extends Omit<FillerDataset, 'episodes'> {
  episodes: Episode[];
  arcs: Arc[];
  counts: EpisodeTypeCounts;
}

/** Lightweight summary of a dataset, stored in `src/data/index.json`. */
export interface CatalogEntry {
  slug: string;
  anilistId: number;
  title: string;
  alternativeTitles: string[];
  totalEpisodes: number;
  counts: EpisodeTypeCounts;
  /** Share of episodes classified as pure filler, 0–100, one decimal. */
  fillerPercentage: number;
  arcCount: number;
  updatedAt: string;
}

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  anime: CatalogEntry[];
}
