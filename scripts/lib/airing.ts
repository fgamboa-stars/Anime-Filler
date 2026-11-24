import type { DatasetEpisode, FillerDataset } from '../../src/types/index.ts';
import type { AflEpisode } from './afl.ts';

export type NewEpisodeRule = 'continue' | 'blocks-100';

export interface AiringShow {
  afl: string;
  slug: string;
  anilistId: number;
  newEpisodes: NewEpisodeRule;
}

export function blockArc(n: number): string {
  const start = Math.floor((n - 1) / 100) * 100 + 1;
  return `Episodes ${start}–${start + 99}`;
}

/**
 * Merge a fresh AnimeFillerList list into an airing show's guide. Classifications
 * and titles follow AnimeFillerList; arcs of episodes already in the guide are kept;
 * new episodes get an arc by `rule`. Episodes AnimeFillerList no longer lists are kept.
 */
export function mergeAiring(existing: FillerDataset, fresh: AflEpisode[], rule: NewEpisodeRule, now = new Date()): { dataset: FillerDataset; added: number; changed: number } {
  const byNumber = new Map(existing.episodes.map((e) => [e.number, e]));
  const lastArc = existing.episodes[existing.episodes.length - 1]?.arc ?? 'Latest episodes';
  let added = 0;
  let changed = 0;
  for (const f of fresh) {
    const old = byNumber.get(f.number);
    if (old) {
      if (old.type !== f.type || (f.title && old.title !== f.title)) changed++;
      byNumber.set(f.number, { ...old, type: f.type, title: f.title || old.title });
    } else {
      added++;
      byNumber.set(f.number, { number: f.number, title: f.title, type: f.type, arc: rule === 'blocks-100' ? blockArc(f.number) : lastArc });
    }
  }
  let episodes: DatasetEpisode[] = [...byNumber.values()].sort((a, b) => a.number - b.number);
  if (rule === 'blocks-100') episodes = episodes.map((e) => ({ ...e, arc: blockArc(e.number) }));
  const dataset: FillerDataset = {
    ...existing,
    totalEpisodes: episodes.length,
    episodes,
    updatedAt: added || changed ? now.toISOString() : existing.updatedAt,
  };
  return { dataset, added, changed };
}
