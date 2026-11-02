#!/usr/bin/env tsx
/** Check every dataset and the catalog for consistency. Exits 1 on problems. */
import { readFileSync } from 'node:fs';
import { CATALOG_PATH, listDatasets } from './lib/catalog.ts';
import { validateDataset, validateCatalog } from './lib/validate.ts';
import type { Catalog } from '../src/types/index.ts';

const datasets = listDatasets();
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as Catalog;
const problems = [...datasets.flatMap(validateDataset), ...validateCatalog(catalog, datasets)];

if (problems.length) {
  console.error(`✖ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✔ ${datasets.length} dataset(s) and the catalog are valid.`);
