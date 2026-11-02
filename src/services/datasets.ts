import catalogJson from '@/data/index.json';
import type { Catalog, CatalogEntry, FillerDataset, PreparedDataset } from '@/types';
import { prepareDataset } from '@/utils/dataset';

/**
 * Filler datasets are discovered at build time: every JSON file in
 * src/data/anime/ becomes its own lazily loaded chunk. Adding an anime is a
 * data import (`npm run import:csv`) — no application code changes.
 */
const loaders = import.meta.glob<FillerDataset>('../data/anime/*.json', { import: 'default' });

export const catalog = catalogJson as Catalog;

export function getCatalog(): CatalogEntry[] {
  return catalog.anime;
}

export function findCatalogBySlug(slug: string): CatalogEntry | undefined {
  return catalog.anime.find((a) => a.slug === slug);
}

export function findCatalogByAniListId(id: number): CatalogEntry | undefined {
  return catalog.anime.find((a) => a.anilistId === id);
}

export function hasFillerData(anilistId: number): boolean {
  return catalog.anime.some((a) => a.anilistId === anilistId);
}

const prepared = new Map<string, Promise<PreparedDataset>>();

export function loadDataset(slug: string): Promise<PreparedDataset> {
  const existing = prepared.get(slug);
  if (existing) return existing;
  const loader = loaders[`../data/anime/${slug}.json`];
  if (!loader) return Promise.reject(new Error(`No filler dataset named "${slug}"`));
  const promise = loader()
    .then(prepareDataset)
    .catch((err) => {
      prepared.delete(slug);
      throw err;
    });
  prepared.set(slug, promise);
  return promise;
}

/** Route helper: datasets get readable slugs, other anime use `<id>-<title>`. */
export function animePath(input: { anilistId?: number; id?: number; slug?: string; title?: string }): string {
  const id = input.anilistId ?? input.id;
  const entry = input.slug ? findCatalogBySlug(input.slug) : id ? findCatalogByAniListId(id) : undefined;
  if (entry) return `/anime/${entry.slug}`;
  if (!id) return '/search';
  const suffix = input.title
    ? input.title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    : '';
  return `/anime/${id}${suffix ? `-${suffix}` : ''}`;
}
