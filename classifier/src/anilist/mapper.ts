import type { AnimeMeta } from '../domain/types.js';

export type { AnimeMeta };

export interface RawMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  format: string | null;
  source: string | null;
  status: string | null;
  season?: string | null;
  seasonYear: number | null;
  episodes: number | null;
  description?: string | null;
  genres: string[] | null;
  tags: Array<{ name: string; rank: number }> | null;
  studios?: { nodes: Array<{ name: string }> } | null;
  characters?: { nodes: Array<{ name: { full: string | null } }> } | null;
  relations?: { edges: Array<{ relationType: string; node: { id: number; type: string } }> } | null;
  nextAiringEpisode?: { episode: number } | null;
  streamingEpisodes?: Array<{ title: string | null }> | null;
  airingSchedule?: {
    pageInfo: { hasNextPage: boolean };
    nodes: Array<{ episode: number; airingAt: number }>;
  } | null;
}

/** Relations that continue the same story. Side stories and adaptations of other works say little about filler. */
const STORY_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'PARENT']);

export function toAnimeMeta(media: RawMedia): AnimeMeta {
  return {
    id: media.id,
    title: media.title.english ?? media.title.romaji ?? `AniList ${media.id}`,
    format: media.format,
    source: media.source,
    status: media.status,
    seasonYear: media.seasonYear,
    totalEpisodes: media.episodes,
    genres: media.genres ?? [],
    tags: (media.tags ?? []).map((t) => ({ name: t.name, rank: t.rank })),
    studios: media.studios?.nodes.map((s) => s.name) ?? [],
    characters: media.characters?.nodes.map((c) => c.name.full).filter((n): n is string => !!n) ?? [],
    relatedAnimeIds:
      media.relations?.edges
        .filter((e) => STORY_RELATIONS.has(e.relationType) && e.node.type === 'ANIME')
        .map((e) => e.node.id) ?? [],
  };
}

export interface ImportedEpisode {
  number: number;
  title: string | null;
  airedAt: Date | null;
}

const STREAMING_TITLE = /^\s*(?:episode|ep\.?)\s*(\d+)\s*(?:[-–—:]\s*(.*))?$/i;

/**
 * AniList has no episode endpoint. This stitches episodes together from what it does expose: the airing
 * schedule for numbers and dates, and streaming links for titles. Episode descriptions don't exist there.
 * Unaired episodes are left out; there is nothing to classify yet.
 */
export function toImportedEpisodes(media: RawMedia): ImportedEpisode[] {
  const lastAired = media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : media.episodes;
  const now = Date.now();
  const episodes = new Map<number, ImportedEpisode>();

  const ensure = (number: number): ImportedEpisode => {
    let episode = episodes.get(number);
    if (!episode) {
      episode = { number, title: null, airedAt: null };
      episodes.set(number, episode);
    }
    return episode;
  };

  if (media.status === 'FINISHED' || media.nextAiringEpisode) {
    for (let number = 1; number <= (lastAired ?? 0); number++) ensure(number);
  }
  for (const node of media.airingSchedule?.nodes ?? []) {
    const airedAt = new Date(node.airingAt * 1000);
    if (airedAt.getTime() <= now) ensure(node.episode).airedAt = airedAt;
  }
  for (const stream of media.streamingEpisodes ?? []) {
    const match = stream.title?.match(STREAMING_TITLE);
    if (!match) continue;
    const number = Number(match[1]);
    const title = match[2]?.trim();
    if (number >= 1 && title && (lastAired == null || number <= lastAired)) ensure(number).title = title;
  }

  return [...episodes.values()].sort((a, b) => a.number - b.number);
}
