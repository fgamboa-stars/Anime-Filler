import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { createPostgres } from '../src/db/database.js';
import { createContainer, type Container, type EngineDeps } from '../src/container.js';
import { AniListClient } from '../src/anilist/client.js';
import type { RawMedia } from '../src/anilist/mapper.js';
import { DEFAULT_SETTINGS, type EngineSettings } from '../src/domain/settings.js';
import type { AnimeMeta, Category, EpisodeInput, LabeledEpisode, TrustLevel } from '../src/domain/types.js';
import type { ClassifierEngine } from '../src/engine/classifier.js';
import { computePrior } from '../src/engine/learning.js';
import type { EvidenceProvider, GlobalKnowledge, SeriesProfile, SimilarHit } from '../src/engine/evidence.js';
import type { ClassificationRule } from '../src/domain/rules.js';

export function anime(overrides: Partial<AnimeMeta> = {}): AnimeMeta {
  return {
    id: 1,
    title: 'Test Show',
    format: 'TV',
    source: 'MANGA',
    status: 'FINISHED',
    seasonYear: 2010,
    totalEpisodes: 50,
    genres: ['Action'],
    tags: [{ name: 'Shounen', rank: 90 }],
    studios: [],
    characters: [],
    relatedAnimeIds: [],
    ...overrides,
  };
}

export function episode(number: number, overrides: Partial<EpisodeInput> = {}): EpisodeInput {
  return { animeId: 1, number, title: `Episode title ${number}`, description: null, arc: null, tags: [], ...overrides };
}

export function labeled(number: number, category: Category, trust: TrustLevel = 'MEDIUM', animeId = 1): LabeledEpisode {
  return { animeId, number, title: `Episode title ${number}`, arc: null, category, trust, reviewStatus: trust === 'HIGH' ? 'APPROVED' : 'UNREVIEWED' };
}

/** `labels('C3 F2')` gives episodes 1-3 CANON and 4-5 FILLER. */
export function labels(pattern: string, trust: TrustLevel = 'MEDIUM', animeId = 1): LabeledEpisode[] {
  const names: Record<string, Category> = { C: 'CANON', F: 'FILLER', M: 'MIXED', A: 'ANIME_CANON', '.': 'CANON' };
  const out: LabeledEpisode[] = [];
  let number = 1;
  for (const part of pattern.split(' ')) {
    const count = Number(part.slice(1) || 1);
    for (let i = 0; i < count; i++) {
      if (part[0] !== '_') out.push(labeled(number, names[part[0]!]!, trust, animeId));
      number += 1;
    }
  }
  return out;
}

export function rule(overrides: Partial<ClassificationRule> = {}): ClassificationRule {
  return {
    id: 1,
    ruleName: 'Test rule',
    targetCategory: 'FILLER',
    scoreValue: 30,
    enabled: true,
    decisive: false,
    condition: { field: 'episode.tags', in: ['beach'] },
    explanation: 'Test explanation',
    skill: 1,
    lastUpdated: new Date(0),
    ...overrides,
  };
}

/** Evidence with whatever a test sets, and a catalog-like base rate. */
export class FakeEvidence implements EvidenceProvider {
  rules: ClassificationRule[] = [];
  neighbours: LabeledEpisode[] = [];
  profile: SeriesProfile | null = null;
  profiles = new Map<number, SeriesProfile>();
  similar: SimilarHit[] = [];
  settings: EngineSettings = DEFAULT_SETTINGS;
  knowledge: Partial<GlobalKnowledge> = {};

  async globalKnowledge(): Promise<GlobalKnowledge> {
    return {
      rules: this.rules,
      settings: this.settings,
      tagPatterns: new Map(),
      prior: computePrior({ CANON: 70, FILLER: 19, MIXED: 7, ANIME_CANON: 4 }),
      calibration: null,
      version: 'test',
      ...this.knowledge,
    };
  }
  async seriesEpisodes(): Promise<LabeledEpisode[]> {
    return this.neighbours;
  }
  async seriesProfile(id: number): Promise<SeriesProfile | null> {
    return this.profiles.get(id) ?? this.profile;
  }
  async searchSimilar(): Promise<SimilarHit[]> {
    return this.similar;
  }
}

export function rawMedia(overrides: Partial<RawMedia> = {}): RawMedia {
  return {
    id: 500,
    title: { romaji: 'Fake Romaji', english: 'Fake Show' },
    format: 'TV',
    source: 'MANGA',
    status: 'FINISHED',
    seasonYear: 2015,
    episodes: 6,
    genres: ['Action'],
    tags: [{ name: 'Shounen', rank: 90 }],
    studios: { nodes: [{ name: 'Studio' }] },
    characters: { nodes: [{ name: { full: 'Hero' } }] },
    relations: { edges: [] },
    nextAiringEpisode: null,
    streamingEpisodes: [
      { title: 'Episode 1 - The Beginning' },
      { title: 'Episode 2 - Training' },
      { title: 'Episode 3 - Beach Episode' },
      { title: 'Episode 4 - Recap' },
      { title: 'Episode 5 - The Battle' },
      { title: 'Episode 6 - The End' },
    ],
    airingSchedule: { pageInfo: { hasNextPage: false }, nodes: [{ episode: 1, airingAt: 1_400_000_000 }] },
    ...overrides,
  };
}

/** A fake AniList that serves one Media and counts requests. */
export function fakeAniList(media: Record<number, RawMedia>): { client: AniListClient; calls: () => number } {
  let calls = 0;
  const client = new AniListClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetch: (async (_url: string, init: RequestInit) => {
      calls += 1;
      const { variables } = JSON.parse(String(init.body)) as { variables: { id?: number; ids?: number[] } };
      const data = variables.ids
        ? { Page: { pageInfo: { hasNextPage: false }, media: variables.ids.map((id) => media[id]).filter(Boolean) } }
        : { Media: media[variables.id!] ?? null };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch,
  });
  return { client, calls: () => calls };
}

/** Set this to run the suite on a real server. Each container then gets its own throwaway database. */
export const TEST_POSTGRES_URL = process.env.TEST_POSTGRES_URL;

export async function freshPostgresUrl(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `t_${randomBytes(8).toString('hex')}`;
  const admin = createPostgres(TEST_POSTGRES_URL!, 1);
  await admin.exec(`CREATE DATABASE ${name}`);
  await admin.close();
  const url = new URL(TEST_POSTGRES_URL!);
  url.pathname = `/${name}`;
  return {
    url: url.href,
    drop: async () => {
      const cleanup = createPostgres(TEST_POSTGRES_URL!, 1);
      await cleanup.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.close();
    },
  };
}

export async function testContainer(options: {
  anilist?: AniListClient;
  engineFactory?: (deps: EngineDeps) => ClassifierEngine;
} = {}): Promise<Container> {
  const log = pino({ level: 'silent' });
  if (!TEST_POSTGRES_URL) return createContainer({ databaseUrl: 'pglite:memory', log, ...options });

  const { url, drop } = await freshPostgresUrl();
  const container = await createContainer({ databaseUrl: url, log, ...options });
  const close = container.close.bind(container);
  container.close = async () => {
    await close();
    await drop();
  };
  return container;
}

/** Inserts a labelled series directly: the same rows a dataset seed would create, without files. */
export async function seedSeries(
  c: Container,
  meta: AnimeMeta,
  pattern: Array<{ number: number; title?: string; category: Category | null; arc?: string | null }>,
): Promise<Map<number, number>> {
  const { upsertAnime, ensureEmbeddings } = await import('../src/app/catalog.js');
  const ids = new Map<number, number>();
  await c.db.tx(async (tx) => {
    await upsertAnime(tx, meta);
    for (const e of pattern) {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO episodes (anime_id, number, title, arc_name, content_hash) VALUES ($1,$2,$3,$4,'x') RETURNING id`,
        [meta.id, e.number, e.title ?? `Episode title ${e.number}`, e.arc ?? null],
      );
      const id = rows[0]!.id;
      ids.set(e.number, id);
      if (e.category) {
        const { rows: history } = await tx.query<{ id: number }>(
          `INSERT INTO classification_history (episode_id, category, confidence, origin, trust_level)
           VALUES ($1,$2,1,'import','MEDIUM') RETURNING id`,
          [id, e.category],
        );
        await tx.query(
          `UPDATE episodes SET current_classification_id = $2, category = $3, confidence = 1, trust_level = 'MEDIUM', origin = 'import' WHERE id = $1`,
          [id, history[0]!.id, e.category],
        );
      }
    }
  });
  await ensureEmbeddings(
    c.db,
    c.embedder,
    pattern.map((e) => ({
      anime: meta,
      episodeId: ids.get(e.number)!,
      input: { animeId: meta.id, number: e.number, title: e.title ?? `Episode title ${e.number}`, description: null, arc: e.arc ?? null, tags: [] },
      trust: e.category ? ('MEDIUM' as const) : ('LOW' as const),
    })),
  );
  await c.db.tx((tx) => c.learning.rebuildAll(tx));
  c.knowledge.invalidate();
  return ids;
}
