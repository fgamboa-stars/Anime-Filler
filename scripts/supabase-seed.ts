#!/usr/bin/env tsx
/**
 * Copy every filler guide in src/data/anime/ into Supabase.
 *
 *   npm run supabase:seed              # upsert all guides
 *   npm run supabase:seed -- naruto    # only these slugs
 *   npm run supabase:seed -- --dry-run # count what would be written
 *   npm run supabase:seed -- --prune   # also delete guides that no longer exist locally
 *
 * Credentials (in .env locally, or as GitHub Actions secrets), either:
 *   SUPABASE_SYNC_TOKEN        – the token for the sync_guides() function (used by the weekly job), or
 *   SUPABASE_SERVICE_ROLE_KEY  – full access; also needed for --prune.
 * The project URL and publishable key default to the ones in src/services/supabase.ts.
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

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://qzsoelgnckqictieqowh.supabase.co').replace(/\/+$/, '');
const publishable = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_3NC0ErUOA7QQkHhFf_5jMw_CZo3noX7';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const syncToken = process.env.SUPABASE_SYNC_TOKEN || '';
if (!serviceKey && !syncToken) {
  console.error('Set SUPABASE_SYNC_TOKEN or SUPABASE_SERVICE_ROLE_KEY first. See docs/SUPABASE.md.');
  process.exit(1);
}
const key = serviceKey || publishable;

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

for (const batch of chunk(rows, 40)) {
  const slugs = batch.map((r) => r.dataset.slug);
  if (syncToken && !serviceKey) {
    // Token mode: one call per batch to sync_guides(), which replaces each guide's episodes.
    await rest('rpc/sync_guides', {
      method: 'POST',
      body: JSON.stringify({ token: syncToken, payload: { datasets: batch.map((r) => r.dataset), episodes: batch.flatMap((r) => r.episodes) } }),
    });
  } else {
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
  }
  console.log(`  ✓ ${slugs.length} guides (${slugs[0]} … ${slugs[slugs.length - 1]})`);
}

if (values.prune && !serviceKey) console.warn('--prune needs SUPABASE_SERVICE_ROLE_KEY; skipped.');
if (values.prune && serviceKey && !positionals.length) {
  const remote = (await rest('datasets?select=slug')) as { slug: string }[];
  const local = new Set(all.map((d) => d.slug));
  const stale = remote.map((r) => r.slug).filter((s) => !local.has(s));
  for (const batch of chunk(stale, 50)) {
    await rest(`datasets?slug=${encodeURIComponent(inList(batch))}`, { method: 'DELETE', prefer: 'return=minimal' });
  }
  console.log(`Pruned ${stale.length} guides that no longer exist locally`);
}
console.log('Done.');
