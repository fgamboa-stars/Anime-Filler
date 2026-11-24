import { useSyncExternalStore } from 'react';
import catalogJson from '@/data/index.json';
import type { Catalog, CatalogEntry, FillerDataset, PreparedDataset } from '@/types';
import { prepareDataset } from '@/utils/dataset';
import { cacheGet, cacheSet } from './cache';
import { fetchCatalogFromSupabase, fetchDatasetFromSupabase, supabaseEnabled } from './supabase';

/**
 * Filler datasets are discovered at build time: every JSON file in
 * src/data/anime/ becomes its own lazily loaded chunk. Adding an anime is a
 * data import (`npm run import:csv`) — no application code changes.
 */
const loaders = import.meta.glob<FillerDataset>('../data/anime/*.json', { import: 'default' });

/** The guide list built into the site: shown instantly and used whenever the database can't be reached. */
export const catalog = catalogJson as Catalog;

/**
 * The live guide list. Starts as the built-in list (or the last database copy
 * cached in this browser), then switches to the database version once
 * refreshCatalog() resolves. New guides added to the database appear without
 * a redeploy.
 */
export type CatalogStatus = 'bundled' | 'loading' | 'live' | 'failed';
const CACHE_KEY = 'catalog:v1';
const CACHE_TTL = 6 * 60 * 60 * 1000;

let current: CatalogEntry[] = (supabaseEnabled() && cacheGet<CatalogEntry[]>(CACHE_KEY)) || catalog.anime;
let status: CatalogStatus = 'bundled';
let snapshot: { entries: CatalogEntry[]; status: CatalogStatus } = { entries: current, status };
const listeners = new Set<() => void>();

function publish(entries: CatalogEntry[], next: CatalogStatus): void {
  current = entries;
  status = next;
  snapshot = { entries, status };
  listeners.forEach((l) => l());
}

let refreshing: Promise<void> | null = null;

/** Load the guide list from Supabase once per page load. Never rejects. */
export function refreshCatalog(): Promise<void> {
  if (!supabaseEnabled()) return Promise.resolve();
  refreshing ??= (async () => {
    publish(current, 'loading');
    try {
      const live = await fetchCatalogFromSupabase();
      if (!live.length) throw new Error('empty catalog');
      cacheSet(CACHE_KEY, live, CACHE_TTL);
      publish(live, 'live');
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Using the built-in guide list', err);
      publish(current, 'failed');
    }
  })();
  return refreshing;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook: the live guide list and whether the database version has arrived. */
export function useCatalog(): { entries: CatalogEntry[]; status: CatalogStatus } {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function getCatalog(): CatalogEntry[] {
  return current;
}

export function findCatalogBySlug(slug: string): CatalogEntry | undefined {
  return current.find((a) => a.slug === slug);
}

export function findCatalogByAniListId(id: number): CatalogEntry | undefined {
  return current.find((a) => a.anilistId === id);
}

export function hasFillerData(anilistId: number): boolean {
  return current.some((a) => a.anilistId === anilistId);
}

const prepared = new Map<string, Promise<PreparedDataset>>();

export function loadDataset(slug: string): Promise<PreparedDataset> {
  const existing = prepared.get(slug);
  if (existing) return existing;
  const loader = loaders[`../data/anime/${slug}.json`];
  if (!loader && !supabaseEnabled()) return Promise.reject(new Error(`No filler dataset named "${slug}"`));
  const promise = fetchRaw(slug, loader)
    .then(prepareDataset)
    .catch((err) => {
      prepared.delete(slug);
      throw err;
    });
  prepared.set(slug, promise);
  return promise;
}

/**
 * Supabase first when it's configured; the JSON bundled with the site is the
 * fallback, so a database outage or a missing row never breaks a guide page.
 */
async function fetchRaw(slug: string, loader: (() => Promise<FillerDataset>) | undefined): Promise<FillerDataset> {
  if (supabaseEnabled()) {
    try {
      const fromDb = await fetchDatasetFromSupabase(slug);
      if (fromDb && fromDb.episodes.length) return fromDb;
    } catch (err) {
      if (import.meta.env.DEV) console.warn(`Supabase unavailable for "${slug}", using bundled data`, err);
    }
  }
  if (!loader) throw new Error(`No filler dataset named "${slug}"`);
  return loader();
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
