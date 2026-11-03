import type { AnimeMeta } from '../domain/types.js';
import { toAnimeMeta, toImportedEpisodes, type ImportedEpisode, type RawMedia } from './mapper.js';


/** Read-through cache for AniList responses. Backed by Postgres in production. */
export interface AniListCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class AniListError extends Error {
  constructor(
    message: string,
    readonly kind: 'rate-limit' | 'network' | 'not-found' | 'server' | 'bad-response',
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AniListError';
  }
}

export interface AniListMetrics {
  request(outcome: string): void;
  cache(hit: boolean): void;
}

export interface AniListClientOptions {
  endpoint?: string;
  cache?: AniListCache;
  metrics?: AniListMetrics;
  fetch?: typeof fetch;
  /** AniList allows roughly 30 requests a minute. Requests are spaced to stay under it. */
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  ttlSeconds?: number;
}

const MEDIA_FIELDS = `
  id format source status season seasonYear episodes genres
  title { romaji english }
  description(asHtml: false)
  tags { name rank }
  studios(isMain: true) { nodes { name } }
  characters(perPage: 15, sort: [ROLE, RELEVANCE]) { nodes { name { full } } }
  relations { edges { relationType node { id type } } }
  nextAiringEpisode { episode }
`;

const MEDIA_BATCH_QUERY = `query ($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} }
  }
}`;

const MEDIA_EPISODES_QUERY = `query ($id: Int, $page: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    streamingEpisodes { title }
    airingSchedule(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      nodes { episode airingAt }
    }
  }
}`;

const DAY = 86_400;

export class AniListClient {
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ttlSeconds: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /** Requests queue on this promise, so concurrent callers still respect the rate limit. */
  private gate: Promise<void> = Promise.resolve();
  private notBefore = 0;

  constructor(private readonly options: AniListClientOptions = {}) {
    this.endpoint = options.endpoint ?? 'https://graphql.anilist.co';
    this.fetchFn = options.fetch ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 2_100;
    this.maxRetries = options.maxRetries ?? 4;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.ttlSeconds = options.ttlSeconds ?? DAY;
  }

  /** Metadata for many anime in as few requests as possible. Cached entries cost nothing. */
  async getAnimeBatch(ids: number[]): Promise<Map<number, AnimeMeta>> {
    const found = new Map<number, AnimeMeta>();
    const missing: number[] = [];
    for (const id of new Set(ids)) {
      const cached = (await this.options.cache?.get(`media:${id}`)) as RawMedia | null | undefined;
      this.options.metrics?.cache(!!cached);
      if (cached) found.set(id, toAnimeMeta(cached));
      else missing.push(id);
    }

    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const data = await this.request<{ Page: { media: RawMedia[] } }>(MEDIA_BATCH_QUERY, { ids: chunk, page: 1 });
      for (const media of data.Page.media) {
        await this.options.cache?.set(`media:${media.id}`, media, this.ttlSeconds);
        found.set(media.id, toAnimeMeta(media));
      }
    }
    return found;
  }

  /** One anime with its episode list. Fetches every airing-schedule page, then caches the merged result. */
  async getAnimeWithEpisodes(id: number): Promise<{ anime: AnimeMeta; episodes: ImportedEpisode[] }> {
    const key = `media-episodes:${id}`;
    const existing = this.inFlight.get(key);
    const pending = existing ?? this.fetchWithEpisodes(key, id).finally(() => this.inFlight.delete(key));
    if (!existing) this.inFlight.set(key, pending);
    const media = (await pending) as RawMedia;
    return { anime: toAnimeMeta(media), episodes: toImportedEpisodes(media) };
  }

  private async fetchWithEpisodes(key: string, id: number): Promise<RawMedia> {
    const cached = (await this.options.cache?.get(key)) as RawMedia | null | undefined;
    this.options.metrics?.cache(!!cached);
    if (cached) return cached;

    let media: RawMedia | null = null;
    for (let page = 1; ; page++) {
      const data = await this.request<{ Media: RawMedia | null }>(MEDIA_EPISODES_QUERY, { id, page });
      if (!data.Media) throw new AniListError(`AniList has no anime ${id}`, 'not-found');
      if (!media) {
        media = data.Media;
      } else {
        media.airingSchedule!.nodes.push(...(data.Media.airingSchedule?.nodes ?? []));
      }
      if (!data.Media.airingSchedule?.pageInfo.hasNextPage) break;
    }
    await this.options.cache?.set(key, media, this.ttlSeconds);
    return media;
  }

  private async throttle(): Promise<void> {
    const previous = this.gate;
    let release!: () => void;
    this.gate = new Promise((resolve) => (release = resolve));
    await previous;
    const wait = this.notBefore - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.notBefore = Date.now() + this.minIntervalMs;
    release();
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let lastError: AniListError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (lastError && lastError.kind !== 'rate-limit') await this.sleep(500 * 2 ** (attempt - 1));
      await this.throttle();

      let response: Response;
      try {
        response = await this.fetchFn(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        this.options.metrics?.request('network-error');
        lastError = new AniListError(`AniList unreachable: ${(error as Error).message}`, 'network');
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After')) || 60;
        this.options.metrics?.request('rate-limited');
        // Every queued caller waits, not just this one.
        this.notBefore = Math.max(this.notBefore, Date.now() + retryAfter * 1000);
        lastError = new AniListError(`AniList rate limit, retry in ${retryAfter}s`, 'rate-limit', retryAfter);
        continue;
      }
      if (response.status >= 500) {
        this.options.metrics?.request('server-error');
        lastError = new AniListError(`AniList returned ${response.status}`, 'server');
        continue;
      }

      const body = (await response.json().catch(() => null)) as {
        data?: T;
        errors?: Array<{ message: string; status?: number }>;
      } | null;

      if (body?.errors?.some((e) => e.status === 404)) {
        this.options.metrics?.request('not-found');
        throw new AniListError('AniList: not found', 'not-found');
      }
      if (!response.ok || !body?.data || body.errors?.length) {
        this.options.metrics?.request('bad-response');
        throw new AniListError(`AniList error: ${body?.errors?.[0]?.message ?? response.status}`, 'bad-response');
      }

      this.options.metrics?.request('ok');
      return body.data;
    }
    throw lastError ?? new AniListError('AniList request failed', 'network');
  }
}
