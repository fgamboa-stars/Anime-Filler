import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './catalog.ts';

export const MANIFEST_PATH = join(ROOT, 'data', 'afl', 'manifest.json');

export interface ManifestSeason {
  anilistId: number;
  title: string;
  episodes: number;
}

export interface ManifestEntry {
  /** AnimeFillerList page: https://www.animefillerlist.com/shows/<afl> */
  afl: string;
  name: string;
  /** matched: ready to import. skipped: see `reason`. manual: IDs set by hand (never overwritten). */
  status: 'matched' | 'skipped' | 'manual';
  reason?: string;
  episodes?: number;
  seasons?: ManifestSeason[];
  /** Dataset slugs written by afl:import, in season order. */
  imported?: string[];
  checkedAt: string;
}

export interface Manifest {
  note: string;
  shows: ManifestEntry[];
}

const NOTE =
  'Maps AnimeFillerList shows to AniList entries. Written by `npm run afl:match`, read by `npm run afl:import`. ' +
  'Set status to "manual" and fill in seasons to override a match by hand.';

export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { note: NOTE, shows: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

export function writeManifest(manifest: Manifest): void {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const shows = [...manifest.shows].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify({ note: NOTE, shows }, null, 2)}\n`);
}

export function upsert(manifest: Manifest, entry: ManifestEntry): void {
  const i = manifest.shows.findIndex((s) => s.afl === entry.afl);
  if (i === -1) manifest.shows.push(entry);
  else manifest.shows[i] = { ...manifest.shows[i], ...entry };
}
