import type { Catalog, FillerDataset } from '../../src/types/index.ts';
import { buildCatalogEntry } from '../../src/utils/dataset.ts';

const TYPES = new Set(['CANON', 'FILLER', 'MIXED', 'ANIME_CANON']);

export function validateDataset(d: FillerDataset): string[] {
  const p: string[] = [];
  const where = `${d.slug ?? '(no slug)'}`;
  if (d.schemaVersion !== 1) p.push(`${where}: unsupported schemaVersion ${String(d.schemaVersion)}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug ?? '')) p.push(`${where}: slug must be lowercase-kebab-case`);
  if (!Number.isInteger(d.anilistId) || d.anilistId < 1) p.push(`${where}: anilistId must be a positive integer`);
  if (!d.title) p.push(`${where}: title is required`);
  if (!Array.isArray(d.episodes) || d.episodes.length === 0) {
    p.push(`${where}: has no episodes`);
    return p;
  }
  if (d.franchiseOrder !== undefined && (!Number.isInteger(d.franchiseOrder) || d.franchiseOrder < 1))
    p.push(`${where}: franchiseOrder must be a positive integer`);
  if ((d.seasonLabel || d.franchiseOrder) && !d.franchise) p.push(`${where}: seasonLabel/franchiseOrder need a franchise`);
  if (d.totalEpisodes !== d.episodes.length) p.push(`${where}: totalEpisodes (${d.totalEpisodes}) ≠ episodes (${d.episodes.length})`);
  const seen = new Set<number>();
  for (const ep of d.episodes) {
    if (!Number.isInteger(ep.number) || ep.number < 1) p.push(`${where}: invalid episode number ${String(ep.number)}`);
    if (seen.has(ep.number)) p.push(`${where}: duplicate episode ${ep.number}`);
    seen.add(ep.number);
    if (!TYPES.has(ep.type)) p.push(`${where}: episode ${ep.number} has invalid type ${String(ep.type)}`);
    if (!ep.title) p.push(`${where}: episode ${ep.number} has no title`);
    if (!ep.arc) p.push(`${where}: episode ${ep.number} has no arc`);
  }
  return p;
}

export function validateCatalog(catalog: Catalog, datasets: FillerDataset[]): string[] {
  const p: string[] = [];
  const ids = new Map<number, string>();
  for (const d of datasets) {
    const other = ids.get(d.anilistId);
    if (other) p.push(`AniList ID ${d.anilistId} is used by both ${other} and ${d.slug}`);
    ids.set(d.anilistId, d.slug);
    const entry = catalog.anime.find((a) => a.slug === d.slug);
    if (!entry) {
      p.push(`catalog is missing ${d.slug} — run npm run data:index`);
      continue;
    }
    const expected = buildCatalogEntry(d);
    if (JSON.stringify(expected.counts) !== JSON.stringify(entry.counts) || expected.anilistId !== entry.anilistId || expected.strip !== entry.strip)
      p.push(`catalog entry for ${d.slug} is stale — run npm run data:index`);
  }
  for (const entry of catalog.anime)
    if (!datasets.some((d) => d.slug === entry.slug)) p.push(`catalog lists ${entry.slug} but no dataset file exists`);
  return p;
}
