import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const row = {
  slug: 'naruto',
  anilist_id: 20,
  title: 'Naruto',
  alternative_titles: ['NARUTO'],
  total_episodes: 2,
  source: 'test',
  franchise: null,
  season_label: null,
  franchise_order: null,
  updated_at: '2026-11-23T00:00:00Z',
  episodes: [
    { number: 2, title: 'Two', type: 'FILLER', arc: 'Arc' },
    { number: 1, title: 'One', type: 'CANON', arc: 'Arc' },
  ],
};

describe('supabase guide loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps a database row to the app dataset shape, episodes in order', async () => {
    const { rowToDataset } = await import('./supabase');
    const d = rowToDataset(row as never);
    expect(d).toMatchObject({ slug: 'naruto', anilistId: 20, alternativeTitles: ['NARUTO'], totalEpisodes: 2 });
    expect(d.episodes.map((e) => e.number)).toEqual([1, 2]);
    expect(d).not.toHaveProperty('franchise');
  });

  it('queries the REST API with the anon key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([row]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDatasetFromSupabase } = await import('./supabase');
    const d = await fetchDatasetFromSupabase('naruto');
    expect(d?.episodes).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://demo.supabase.co/rest/v1/datasets?');
    expect(url).toContain('slug=eq.naruto');
    expect(init.headers.apikey).toBe('anon-key');
  });

  it('serves guides from Supabase when configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ ...row, title: 'From DB' }]), { status: 200 })));
    const { loadDataset } = await import('./datasets');
    expect((await loadDataset('naruto')).title).toBe('From DB');
  });

  it('falls back to the bundled guide when Supabase fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    const { loadDataset } = await import('./datasets');
    const d = await loadDataset('naruto');
    expect(d.title).toBe('Naruto');
    expect(d.episodes.length).toBe(220);
  });

  it('is off when the env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const { supabaseEnabled } = await import('./supabase');
    expect(supabaseEnabled()).toBe(false);
  });
});

describe('live guide list', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const catalogRow = {
    slug: 'brand-new-show',
    anilist_id: 999,
    title: 'Brand New Show',
    alternative_titles: [],
    total_episodes: 3,
    franchise: null,
    season_label: null,
    franchise_order: null,
    updated_at: '2026-11-23T00:00:00Z',
    canon: 2,
    filler: 1,
    mixed: 0,
    anime_canon: 0,
    arc_count: 1,
    strip: 'C2F1',
  };

  it('maps catalog rows, computing the filler percentage like the build does', async () => {
    const { rowToCatalogEntry } = await import('./supabase');
    expect(rowToCatalogEntry(catalogRow)).toMatchObject({ slug: 'brand-new-show', fillerPercentage: 33.3, strip: 'C2F1' });
  });

  it('starts with the built-in list and switches to the database list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([catalogRow]), { status: 200 })));
    const ds = await import('./datasets');
    expect(ds.getCatalog().length).toBeGreaterThan(300);
    expect(ds.findCatalogBySlug('brand-new-show')).toBeUndefined();
    await ds.refreshCatalog();
    expect(ds.findCatalogBySlug('brand-new-show')?.title).toBe('Brand New Show');
    expect(ds.hasFillerData(999)).toBe(true);
  });

  it('keeps the built-in list when the database is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const ds = await import('./datasets');
    await ds.refreshCatalog();
    expect(ds.findCatalogBySlug('naruto')).toBeDefined();
  });
});
