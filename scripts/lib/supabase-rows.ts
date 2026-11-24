import type { FillerDataset } from '../../src/types/index.ts';

export interface DatasetRowInsert {
  slug: string;
  anilist_id: number;
  title: string;
  alternative_titles: string[];
  total_episodes: number;
  source: string | null;
  franchise: string | null;
  season_label: string | null;
  franchise_order: number | null;
  updated_at: string;
}

export interface EpisodeRowInsert {
  dataset_slug: string;
  number: number;
  title: string;
  type: string;
  arc: string;
}

/** Convert a dataset JSON file into the rows stored in Supabase. */
export function toRows(d: FillerDataset): { dataset: DatasetRowInsert; episodes: EpisodeRowInsert[] } {
  return {
    dataset: {
      slug: d.slug,
      anilist_id: d.anilistId,
      title: d.title,
      alternative_titles: d.alternativeTitles ?? [],
      total_episodes: d.totalEpisodes,
      source: d.source ?? null,
      franchise: d.franchise ?? null,
      season_label: d.seasonLabel ?? null,
      franchise_order: d.franchiseOrder ?? null,
      updated_at: d.updatedAt,
    },
    episodes: d.episodes.map((e) => ({ dataset_slug: d.slug, number: e.number, title: e.title, type: e.type, arc: e.arc })),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
