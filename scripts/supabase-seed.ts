#!/usr/bin/env tsx
/**
 * Copy every filler guide in src/data/anime/ into Supabase.
 *
 *   npm run supabase:seed              # upsert all guides
 *   npm run supabase:seed -- naruto    # only these slugs
 *   npm run supabase:seed -- --dry-run # count what would be written
 *   npm run supabase:seed -- --prune   # also delete guides that no longer exist locally
 *
 * Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.
 * Safe to run repeatedly: guides are upserted and each guide's episodes are replaced.
 */
import { parseArgs } from 'node:util';
import { listDatasets } from './lib/catalog.ts';
import { chunk, toRows } from './lib/supabase-rows.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false }, prune: { type: 'boolean', default: false } },
});

const all = listDatasets();
const datasets = positionals.length ? all.filter((d) => positionals.includes(d.slug)) : all;
const missing = positionals.filter((s) => !all.some((d) => d.slug === s));
if (missing.length) console.warn(`Not found locally: ${missing.join(', ')}`);

const rows = datasets.map(toRows);
const episodeCount = rows.reduce((n, r) => n + r.episodes.length, 0);
console.log(`${rows.length} guides, ${episodeCount} episodes`);
if (values['dry-run']) process.exit(0);

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env first. See docs/SUPABASE.md.');
  process.exit(1);
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const inList = (slugs: string[]) => `in.(${slugs.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')})`;

for (const batch of chunk(rows, 50)) {
  const slugs = batch.map((r) => r.dataset.slug);
  await rest('datasets?on_conflict=slug', {
    method: 'POST',
    body: JSON.stringify(batch.map((r) => r.dataset)),
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  await rest(`episodes?dataset_slug=${encodeURIComponent(inList(slugs))}`, { method: 'DELETE', prefer: 'return=minimal' });
  for (const eps of chunk(
    batch.flatMap((r) => r.episodes),
    1000,
  )) {
    await rest('episodes', { method: 'POST', body: JSON.stringify(eps), prefer: 'return=minimal' });
  }
  console.log(`  ✓ ${slugs.length} guides (${slugs[0]} … ${slugs[slugs.length - 1]})`);
}

if (values.prune && !positionals.length) {
  const remote = (await rest('datasets?select=slug')) as { slug: string }[];
  const local = new Set(all.map((d) => d.slug));
  const stale = remote.map((r) => r.slug).filter((s) => !local.has(s));
  for (const batch of chunk(stale, 50)) {
    await rest(`datasets?slug=${encodeURIComponent(inList(batch))}`, { method: 'DELETE', prefer: 'return=minimal' });
  }
  console.log(`Pruned ${stale.length} guides that no longer exist locally`);
}
console.log('Done.');
