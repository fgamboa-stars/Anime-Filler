import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog, FillerDataset } from '../../src/types/index.ts';
import { buildCatalogEntry } from '../../src/utils/dataset.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const DATA_DIR = join(ROOT, 'src', 'data');
export const DATASET_DIR = join(DATA_DIR, 'anime');
export const CATALOG_PATH = join(DATA_DIR, 'index.json');

export function datasetPath(slug: string): string {
  return join(DATASET_DIR, `${slug}.json`);
}

export function readDataset(slug: string): FillerDataset | null {
  const path = datasetPath(slug);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as FillerDataset;
}

export function listDatasets(): FillerDataset[] {
  if (!existsSync(DATASET_DIR)) return [];
  return readdirSync(DATASET_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DATASET_DIR, f), 'utf8')) as FillerDataset);
}

export function buildCatalog(datasets: FillerDataset[], now = new Date()): Catalog {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    anime: datasets.map(buildCatalogEntry).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export function writeCatalog(catalog: Catalog): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}
