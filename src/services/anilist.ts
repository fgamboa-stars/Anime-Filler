import { cacheGet, cacheSet } from './cache';

const ENDPOINT: string = import.meta.env.VITE_ANILIST_API || 'https://graphql.anilist.co';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface MediaTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

/** Fields shown on cards and in search results. */
export interface MediaSummary {
  id: number;
  title: MediaTitle;
  synonyms: string[];
  format: string | null;
  status: MediaStatus | null;
  episodes: number | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
  coverImage: { large: string | null; medium: string | null; color: string | null };
}

/** Full detail-page fields. */
export interface MediaDetail extends MediaSummary {
  description: string | null;
  season: MediaSeason | null;
  studios: { nodes: { id: number; name: string }[] };
  startDate: FuzzyDate;
  endDate: FuzzyDate;
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null; medium: string | null; color: string | null };
  siteUrl: string | null;
  duration: number | null;
  nextAiringEpisode: { episode: number } | null;
}

export type AniListErrorKind = 'rate-limit' | 'network' | 'not-found' | 'server' | 'bad-response';

export class AniListError extends Error {
  readonly kind: AniListErrorKind;
  readonly status?: number;
  /** Seconds until requests are accepted again (rate-limit errors only). */
  readonly retryAfter?: number;

  constructor(kind: AniListErrorKind, message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = 'AniListError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const SUMMARY_FIELDS = `
  id
  title { romaji english native }
  synonyms
  format
  status
  episodes
  seasonYear
  averageScore
  popularity
  genres
  coverImage { large medium color }
`;

const DETAIL_FIELDS = `
  id
  title { romaji english native }
  synonyms
  format
  status
  episodes
  duration
  season
  seasonYear
  averageScore
  popularity
  genres
  description(asHtml: false)
  studios(isMain: true) { nodes { id name } }
  startDate { year month day }
  endDate { year month day }
  bannerImage
  coverImage { extraLarge large medium color }
  siteUrl
  nextAiringEpisode { episode }
`;

// ── Rate limiting ──────────────────────────────────────────────────────────
// AniList answers 429 with Retry-After. We remember that moment globally so
// every caller backs off together instead of hammering the API.
let blockedUntil = 0;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const inflight = new Map<string, Promise<unknown>>();

interface RequestOptions {
  signal?: AbortSignal;
  cacheKey?: string;
  ttl?: number;
  retries?: number;
}

export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  { signal, cacheKey, ttl = HOUR, retries = 2 }: RequestOptions = {},
): Promise<T> {
  if (cacheKey) {
    const cached = cacheGet<T>(cacheKey);
    if (cached !== undefined) return cached;
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const run = async (signal?: AbortSignal): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = blockedUntil - Date.now();
      if (wait > 0) {
        if (wait > 4000 || attempt >= retries)
          throw new AniListError('rate-limit', 'AniList is rate limiting requests', 429, Math.ceil(wait / 1000));
        await sleep(wait, signal);
      }

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
          signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (attempt < retries) {
          await sleep(400 * 2 ** attempt, signal);
          continue;
        }
        throw new AniListError('network', 'Could not reach AniList');
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After')) || 60;
        blockedUntil = Date.now() + retryAfter * 1000;
        if (attempt < retries && retryAfter <= 4) continue;
        throw new AniListError('rate-limit', 'AniList is rate limiting requests', 429, retryAfter);
      }
      if (res.status >= 500) {
        if (attempt < retries) {
          await sleep(500 * 2 ** attempt, signal);
          continue;
        }
        throw new AniListError('server', `AniList returned ${res.status}`, res.status);
      }

      let json: { data?: T; errors?: { message: string; status?: number }[] };
      try {
        json = await res.json();
      } catch {
        throw new AniListError('bad-response', 'AniList sent an unreadable response', res.status);
      }
      if (res.status === 404 || json.errors?.some((e) => e.status === 404))
        throw new AniListError('not-found', 'AniList has no anime with that ID', 404);
      if (!res.ok || !json.data)
        throw new AniListError('bad-response', json.errors?.[0]?.message ?? `AniList returned ${res.status}`, res.status);

      if (cacheKey) cacheSet(cacheKey, json.data, ttl);
      return json.data;
    }
  };

  if (!cacheKey) return run(signal);
  // Cacheable requests are shared between concurrent callers and are allowed to
  // finish (filling the cache) even if the caller that started them goes away;
  // each caller still stops waiting as soon as its own signal aborts.
  const promise = run().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return withAbort(promise, signal);
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Test helper: forget any rate-limit backoff. */
export function resetAniListState(): void {
  blockedUntil = 0;
  inflight.clear();
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function searchAnime(search: string, { signal, perPage = 12 }: { signal?: AbortSignal; perPage?: number } = {}) {
  const term = search.trim();
  if (!term) return [];
  const data = await anilistRequest<{ Page: { media: MediaSummary[] } }>(
    `query ($search: String, $perPage: Int) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) { ${SUMMARY_FIELDS} }
      }
    }`,
    { search: term, perPage },
    { signal, cacheKey: `search:${perPage}:${term.toLowerCase()}`, ttl: 6 * HOUR },
  );
  return data.Page.media;
}

export async function getAnimeDetail(id: number, { signal }: { signal?: AbortSignal } = {}) {
  const data = await anilistRequest<{ Media: MediaDetail | null }>(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${DETAIL_FIELDS} } }`,
    { id },
    { signal, cacheKey: `media:${id}`, ttl: 12 * HOUR },
  );
  if (!data.Media) throw new AniListError('not-found', 'AniList has no anime with that ID', 404);
  return data.Media;
}

export async function getAnimeByIds(ids: number[], { signal }: { signal?: AbortSignal } = {}) {
  if (ids.length === 0) return [];
  const sorted = [...ids].sort((a, b) => a - b);
  const data = await anilistRequest<{ Page: { media: MediaSummary[] } }>(
    `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${SUMMARY_FIELDS} } } }`,
    { ids: sorted },
    { signal, cacheKey: `ids:${sorted.join(',')}`, ttl: 12 * HOUR },
  );
  return data.Page.media;
}

export async function getTopRated({ signal, perPage = 12 }: { signal?: AbortSignal; perPage?: number } = {}) {
  const data = await anilistRequest<{ Page: { media: MediaSummary[] } }>(
    `query ($perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, isAdult: false, sort: SCORE_DESC, format_in: [TV], popularity_greater: 50000) { ${SUMMARY_FIELDS} }
      }
    }`,
    { perPage },
    { signal, cacheKey: `top-rated:${perPage}`, ttl: 24 * HOUR },
  );
  return data.Page.media;
}

/** Episodes aired so far: the episode count, or one before the next airing episode. */
export function airedEpisodes(media: Pick<MediaDetail, 'episodes' | 'nextAiringEpisode'> | null): number | null {
  if (!media) return null;
  if (media.nextAiringEpisode) return media.nextAiringEpisode.episode - 1;
  return media.episodes;
}

/** Display title preference: English, then romaji, then native. */
export function displayTitle(title: MediaTitle): string {
  return title.english || title.romaji || title.native || 'Untitled';
}

/** AniList descriptions contain a little HTML; reduce it to plain paragraphs. */
export function cleanDescription(html: string | null): string[] {
  if (!html) return [];
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
  return text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function formatStatus(status: MediaStatus | null): string {
  switch (status) {
    case 'FINISHED':
      return 'Finished';
    case 'RELEASING':
      return 'Airing';
    case 'NOT_YET_RELEASED':
      return 'Not yet aired';
    case 'CANCELLED':
      return 'Cancelled';
    case 'HIATUS':
      return 'On hiatus';
    default:
      return 'Unknown status';
  }
}

export function formatFormat(format: string | null): string | null {
  if (!format) return null;
  const map: Record<string, string> = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
  return map[format] ?? format;
}

export function formatSeason(season: MediaSeason | null, year: number | null): string | null {
  if (!year) return null;
  if (!season) return String(year);
  return `${season.charAt(0)}${season.slice(1).toLowerCase()} ${year}`;
}

export function formatDate(date: FuzzyDate | null | undefined): string | null {
  if (!date?.year) return null;
  if (!date.month) return String(date.year);
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day ?? 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', ...(date.day ? { day: 'numeric' } : {}), timeZone: 'UTC' });
}
