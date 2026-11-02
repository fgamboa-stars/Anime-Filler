import { vi } from 'vitest';
import type { MediaDetail, MediaSummary } from '@/services/anilist';

export function media(id: number, english: string, extra: Partial<MediaDetail> = {}): MediaDetail {
  return {
    id,
    title: { romaji: english, english, native: null },
    synonyms: [],
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    duration: 24,
    season: 'SPRING',
    seasonYear: 2013,
    averageScore: 85,
    popularity: 1000,
    genres: ['Action'],
    description: 'A <i>test</i> description.<br><br>Second paragraph.',
    studios: { nodes: [{ id: 1, name: 'Test Studio' }] },
    startDate: { year: 2013, month: 4, day: 7 },
    endDate: { year: 2013, month: 9, day: 28 },
    bannerImage: null,
    coverImage: { extraLarge: null, large: null, medium: null, color: null },
    siteUrl: `https://anilist.co/anime/${id}`,
    ...extra,
  };
}

type Handler = (variables: Record<string, unknown>, query: string) => { status?: number; body: unknown; headers?: Record<string, string> };

/** Replace global fetch with a fake AniList endpoint. */
export function mockAniList(handler: Handler) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body ?? '{}')) as { query: string; variables: Record<string, unknown> };
    const { status = 200, body, headers = {} } = handler(variables, query);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const page = (items: MediaSummary[]) => ({ data: { Page: { media: items } } });
