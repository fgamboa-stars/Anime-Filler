import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_RULES, SEED_TAG_DETECTORS } from '../domain/seedData.js';
import type { ClassificationRule, TagDetector } from '../domain/rules.js';
import type { AnimeMeta, Category } from '../domain/types.js';
import { detectEpisodeTags } from '../engine/learning.js';

export interface CorpusEpisode {
  number: number;
  title: string;
  /** Null when the dataset only has the importer's placeholder. */
  arc: string | null;
  category: Category;
}

export interface CorpusSeries {
  anime: AnimeMeta;
  slug: string;
  franchise: string | null;
  franchiseOrder: number | null;
  episodes: CorpusEpisode[];
}

interface DatasetFile {
  slug: string;
  anilistId: number;
  franchise?: string;
  franchiseOrder?: number;
  episodes: Array<{ number: number; title: string; type: Category; arc?: string }>;
}

export function loadCorpus(datasetsDir: string, metadataFile: string): CorpusSeries[] {
  const metadata = new Map(
    (JSON.parse(readFileSync(metadataFile, 'utf8')) as AnimeMeta[]).map((m) => [m.id, m]),
  );
  const corpus: CorpusSeries[] = [];
  for (const file of readdirSync(datasetsDir).filter((f) => f.endsWith('.json')).sort()) {
    const dataset = JSON.parse(readFileSync(join(datasetsDir, file), 'utf8')) as DatasetFile;
    const anime = metadata.get(dataset.anilistId);
    if (!anime) throw new Error(`No metadata for ${dataset.slug} (${dataset.anilistId}). Refetch the fixture.`);
    corpus.push({
      // The snapshot was taken after completion. Keep the count, since the importer knows it for finished shows.
      anime,
      slug: dataset.slug,
      franchise: dataset.franchise ?? null,
      franchiseOrder: dataset.franchiseOrder ?? null,
      episodes: dataset.episodes
        .map((e) => ({
          number: e.number,
          title: e.title,
          arc: e.arc && e.arc !== 'Standalone Episodes' ? e.arc : null,
          category: e.type,
        }))
        .sort((a, b) => a.number - b.number),
    });
  }
  return corpus;
}

/**
 * Groups series that share a story, using dataset franchise names and AniList relations. A hold-out must
 * remove the whole group: Naruto would otherwise leak into a "never seen" Naruto Shippuden.
 */
export function storyGroups(corpus: CorpusSeries[]): CorpusSeries[][] {
  const parent = new Map<number, number>(corpus.map((s) => [s.anime.id, s.anime.id]));
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));

  const byFranchise = new Map<string, number>();
  for (const series of corpus) {
    if (series.franchise) {
      const first = byFranchise.get(series.franchise);
      if (first !== undefined) union(first, series.anime.id);
      else byFranchise.set(series.franchise, series.anime.id);
    }
    for (const related of series.anime.relatedAnimeIds) if (parent.has(related)) union(series.anime.id, related);
  }

  const groups = new Map<number, CorpusSeries[]>();
  for (const series of corpus) {
    const root = find(series.anime.id);
    groups.set(root, [...(groups.get(root) ?? []), series]);
  }
  return [...groups.values()];
}

/** Seed rules with ids, as the database would hand them to the engine. */
export function seedRulesForEval(): ClassificationRule[] {
  return SEED_RULES.map((rule, i) => ({
    id: i + 1,
    ruleName: rule.ruleName,
    targetCategory: rule.targetCategory,
    scoreValue: rule.scoreValue,
    enabled: true,
    decisive: rule.decisive ?? false,
    condition: rule.condition,
    explanation: rule.explanation,
    skill: 0.5,
    lastUpdated: new Date(0),
  }));
}

export function seedDetectorsForEval(): TagDetector[] {
  return SEED_TAG_DETECTORS.map((d) => ({ ...d, enabled: true }));
}

export function episodeTags(detectors: TagDetector[], episode: { title: string | null; arc?: string | null }, includeArc: boolean): string[] {
  return detectEpisodeTags(detectors, { title: episode.title, description: null, arc: includeArc ? (episode.arc ?? null) : null });
}
