import { AniListClient, AniListError, type AniListCache } from '../src/anilist/client.js';
import { toAnimeMeta, toImportedEpisodes } from '../src/anilist/mapper.js';
import { fakeAniList, rawMedia } from './helpers.js';

function memoryCache(): AniListCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return { store, get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
}

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const ok = { data: { Media: rawMedia() } };

describe('mapping AniList media', () => {
  it('keeps only relations that continue the story', () => {
    const meta = toAnimeMeta(
      rawMedia({
        relations: {
          edges: [
            { relationType: 'PREQUEL', node: { id: 1, type: 'ANIME' } },
            { relationType: 'SEQUEL', node: { id: 2, type: 'ANIME' } },
            { relationType: 'ADAPTATION', node: { id: 3, type: 'MANGA' } },
            { relationType: 'SIDE_STORY', node: { id: 4, type: 'ANIME' } },
            { relationType: 'PARENT', node: { id: 5, type: 'MANGA' } },
          ],
        },
      }),
    );
    expect(meta.relatedAnimeIds).toEqual([1, 2]);
  });

  it('prefers the English title and falls back to Romaji', () => {
    expect(toAnimeMeta(rawMedia()).title).toBe('Fake Show');
    expect(toAnimeMeta(rawMedia({ title: { romaji: 'Only Romaji', english: null } })).title).toBe('Only Romaji');
  });
});

describe('building episodes from what AniList exposes', () => {
  it('numbers a finished show from its count and takes titles from streaming links', () => {
    const episodes = toImportedEpisodes(rawMedia());
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(episodes[2]!.title).toBe('Beach Episode');
    expect(episodes[0]!.airedAt).toEqual(new Date(1_400_000_000_000));
  });

  it('leaves the title empty rather than inventing one', () => {
    const episodes = toImportedEpisodes(rawMedia({ streamingEpisodes: [], episodes: 2 }));
    expect(episodes.map((e) => e.title)).toEqual([null, null]);
  });

  it('skips unaired episodes of a show still airing', () => {
    const episodes = toImportedEpisodes(
      rawMedia({
        status: 'RELEASING',
        episodes: null,
        nextAiringEpisode: { episode: 4 },
        streamingEpisodes: [{ title: 'Episode 3 - Aired' }, { title: 'Episode 9 - Listed Early' }],
        airingSchedule: {
          pageInfo: { hasNextPage: false },
          nodes: [{ episode: 3, airingAt: 1_400_000_000 }, { episode: 4, airingAt: 4_000_000_000 }],
        },
      }),
    );
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(episodes[2]!.title).toBe('Aired');
  });

  it('ignores streaming titles it cannot parse', () => {
    const episodes = toImportedEpisodes(rawMedia({ episodes: 1, streamingEpisodes: [{ title: 'Trailer' }, { title: null }] }));
    expect(episodes).toEqual([{ number: 1, title: null, airedAt: new Date(1_400_000_000_000) }]);
  });
});

describe('AniList client', () => {
  it('backs off on 429 using Retry-After, then succeeds', async () => {
    const waits: number[] = [];
    const replies = [respond(429, {}, { 'Retry-After': '7' }), respond(200, ok)];
    const client = new AniListClient({
      minIntervalMs: 0,
      sleep: async (ms) => void waits.push(ms),
      fetch: (async () => replies.shift()!) as typeof fetch,
    });
    const { anime } = await client.getAnimeWithEpisodes(500);
    expect(anime.title).toBe('Fake Show');
    expect(Math.max(...waits)).toBeGreaterThan(6_000);
  });

  it('retries server errors and network failures', async () => {
    const replies: Array<Response | Error> = [respond(502, {}), new Error('socket hang up'), respond(200, ok)];
    let calls = 0;
    const client = new AniListClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => {
        calls += 1;
        const next = replies.shift()!;
        if (next instanceof Error) throw next;
        return next;
      }) as typeof fetch,
    });
    await client.getAnimeWithEpisodes(500);
    expect(calls).toBe(3);
  });

  it('gives up with a typed error after the retry budget', async () => {
    const client = new AniListClient({
      minIntervalMs: 0,
      maxRetries: 2,
      sleep: async () => undefined,
      fetch: (async () => respond(500, {})) as typeof fetch,
    });
    await expect(client.getAnimeWithEpisodes(500)).rejects.toMatchObject({ name: 'AniListError', kind: 'server' });
  });

  it('does not retry a missing anime', async () => {
    let calls = 0;
    const client = new AniListClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => {
        calls += 1;
        return respond(404, { errors: [{ message: 'Not Found.', status: 404 }], data: { Media: null } });
      }) as typeof fetch,
    });
    await expect(client.getAnimeWithEpisodes(1)).rejects.toBeInstanceOf(AniListError);
    expect(calls).toBe(1);
  });

  it('spaces out requests to stay under the rate limit', async () => {
    const waits: number[] = [];
    const client = new AniListClient({
      minIntervalMs: 2_000,
      sleep: async (ms) => void waits.push(ms),
      fetch: (async () => respond(200, { data: { Page: { media: [] } } })) as typeof fetch,
    });
    await client.getAnimeBatch([1]);
    await client.getAnimeBatch([2]);
    expect(waits.length).toBeGreaterThan(0);
  });

  it('serves repeat lookups from cache without touching the network', async () => {
    const { calls } = fakeAniList({});
    const cache = memoryCache();
    let fetches = 0;
    const client = new AniListClient({
      cache,
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => {
        fetches += 1;
        return respond(200, ok);
      }) as typeof fetch,
    });
    await client.getAnimeWithEpisodes(500);
    await client.getAnimeWithEpisodes(500);
    expect(fetches).toBe(1);
    expect(calls()).toBe(0);
  });

  it('shares one request between concurrent callers', async () => {
    let fetches = 0;
    const client = new AniListClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => {
        fetches += 1;
        return respond(200, ok);
      }) as typeof fetch,
    });
    await Promise.all([client.getAnimeWithEpisodes(500), client.getAnimeWithEpisodes(500)]);
    expect(fetches).toBe(1);
  });

  it('follows airing-schedule pages', async () => {
    const pages = [
      rawMedia({ airingSchedule: { pageInfo: { hasNextPage: true }, nodes: [{ episode: 1, airingAt: 1_400_000_000 }] } }),
      rawMedia({ airingSchedule: { pageInfo: { hasNextPage: false }, nodes: [{ episode: 2, airingAt: 1_400_000_100 }] } }),
    ];
    const client = new AniListClient({
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async () => respond(200, { data: { Media: pages.shift() } })) as typeof fetch,
    });
    const { episodes } = await client.getAnimeWithEpisodes(500);
    expect(episodes[1]!.airedAt).toEqual(new Date(1_400_000_100_000));
  });

  it('batches metadata lookups and only fetches what the cache lacks', async () => {
    const seen: number[][] = [];
    const cache = memoryCache();
    cache.store.set('media:1', rawMedia({ id: 1 }));
    const client = new AniListClient({
      cache,
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: (async (_u: string, init: RequestInit) => {
        const ids = (JSON.parse(String(init.body)) as { variables: { ids: number[] } }).variables.ids;
        seen.push(ids);
        return respond(200, { data: { Page: { media: ids.map((id) => rawMedia({ id })) } } });
      }) as typeof fetch,
    });
    const result = await client.getAnimeBatch([1, 2, ...Array.from({ length: 60 }, (_, i) => i + 10)]);
    expect(result.size).toBe(62);
    expect(seen.map((s) => s.length)).toEqual([50, 11]);
    expect(seen.flat()).not.toContain(1);
  });
});
