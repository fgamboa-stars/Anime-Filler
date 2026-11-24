import type { CatalogEntry, DatasetEpisode, EpisodeType, FillerDataset } from '@/types';
import { fillerPercentage } from '@/utils/dataset';

/**
 * Read-only access to the filler guides stored in Supabase, through its REST
 * API (PostgREST). Uses plain fetch, so no client library is bundled.
 *
 * Uses the project below unless VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * override it. The key is safe to ship to browsers: row-level security in
 * supabase/migrations only allows reading.
 */
/** The project's public settings. The publishable key is meant to ship in browser code. */
const DEFAULT_URL = 'https://qzsoelgnckqictieqowh.supabase.co';
const DEFAULT_KEY = 'sb_publishable_3NC0ErUOA7QQkHhFf_5jMw_CZo3noX7';

// Env vars override the defaults; set VITE_SUPABASE_URL to an empty string to switch Supabase off.
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const URL_ = (envUrl ?? DEFAULT_URL).replace(/\/+$/, '');
const KEY = envKey ?? DEFAULT_KEY;

export function supabaseEnabled(): boolean {
  return Boolean(URL_ && KEY);
}

interface DatasetRow {
  slug: string;
  anilist_id: number;
  title: string;
  alternative_titles: string[] | null;
  total_episodes: number;
  source: string | null;
  franchise: string | null;
  season_label: string | null;
  franchise_order: number | null;
  updated_at: string;
  episodes: { number: number; title: string; type: EpisodeType; arc: string }[];
}

/** Map a database row (with embedded episodes) to the dataset shape the app already uses. */
export function rowToDataset(row: DatasetRow): FillerDataset {
  const episodes: DatasetEpisode[] = [...(row.episodes ?? [])]
    .sort((a, b) => a.number - b.number)
    .map((e) => ({ number: e.number, title: e.title, type: e.type, arc: e.arc }));
  return {
    schemaVersion: 1,
    slug: row.slug,
    anilistId: row.anilist_id,
    title: row.title,
    alternativeTitles: row.alternative_titles ?? [],
    totalEpisodes: row.total_episodes,
    ...(row.source ? { source: row.source } : {}),
    ...(row.franchise ? { franchise: row.franchise } : {}),
    ...(row.season_label ? { seasonLabel: row.season_label } : {}),
    ...(row.franchise_order != null ? { franchiseOrder: row.franchise_order } : {}),
    updatedAt: row.updated_at,
    episodes,
  };
}

/** Fetch one guide with its episodes. Resolves null when the slug isn't in the database. */
export async function fetchDatasetFromSupabase(slug: string, signal?: AbortSignal): Promise<FillerDataset | null> {
  if (!URL_ || !KEY) throw new Error('Supabase is not configured');
  const params = new URLSearchParams({
    select: '*,episodes(number,title,type,arc)',
    slug: `eq.${slug}`,
    limit: '1',
  });
  const res = await fetch(`${URL_}/rest/v1/datasets?${params}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  const rows = (await res.json()) as DatasetRow[];
  return rows[0] ? rowToDataset(rows[0]) : null;
}

interface CatalogRow {
  slug: string;
  anilist_id: number;
  title: string;
  alternative_titles: string[] | null;
  total_episodes: number;
  franchise: string | null;
  season_label: string | null;
  franchise_order: number | null;
  updated_at: string;
  canon: number;
  filler: number;
  mixed: number;
  anime_canon: number;
  arc_count: number;
  strip: string;
}

/** Map a row of the `catalog` view to the CatalogEntry shape built into the site. */
export function rowToCatalogEntry(row: CatalogRow): CatalogEntry {
  const counts = { CANON: row.canon, FILLER: row.filler, MIXED: row.mixed, ANIME_CANON: row.anime_canon };
  return {
    slug: row.slug,
    anilistId: row.anilist_id,
    title: row.title,
    alternativeTitles: row.alternative_titles ?? [],
    totalEpisodes: row.total_episodes,
    counts,
    fillerPercentage: fillerPercentage(counts),
    arcCount: row.arc_count,
    strip: row.strip,
    ...(row.franchise ? { franchise: row.franchise } : {}),
    ...(row.season_label ? { seasonLabel: row.season_label } : {}),
    ...(row.franchise_order ? { franchiseOrder: row.franchise_order } : {}),
    updatedAt: row.updated_at,
  };
}

/** Fetch the whole guide list (one summary row per season), sorted by title. */
export async function fetchCatalogFromSupabase(signal?: AbortSignal): Promise<CatalogEntry[]> {
  if (!URL_ || !KEY) throw new Error('Supabase is not configured');
  const params = new URLSearchParams({ select: '*', order: 'title.asc', limit: '5000' });
  const res = await fetch(`${URL_}/rest/v1/catalog?${params}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  const rows = (await res.json()) as CatalogRow[];
  return rows.map(rowToCatalogEntry).filter((e) => e.strip !== '');
}
