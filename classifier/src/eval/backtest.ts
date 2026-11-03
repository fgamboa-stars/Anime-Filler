import type { ClassificationRule, TagDetector } from '../domain/rules.js';
import { DEFAULT_SETTINGS, type EngineSettings } from '../domain/settings.js';
import type { AnimeMeta, Category, Distribution, EpisodeInput, LabeledEpisode } from '../domain/types.js';
import { CATEGORIES } from '../domain/types.js';
import { buildEmbeddingDocument, cosine, HashingEmbedder, type EmbeddingDocument } from '../embedding/embedder.js';
import type { EvidenceTier } from '../engine/arc.js';
import { finalConfidence, fitCalibration, type Calibration } from '../engine/calibration.js';
import type { Prediction } from '../engine/classifier.js';
import { decide } from '../engine/decision.js';
import type { EvidenceProvider, GlobalKnowledge, SeriesProfile, SimilarHit } from '../engine/evidence.js';
import { HybridEngine } from '../engine/hybrid.js';
import { computePrior, learnRuleCounts, ruleSkill, type LearningSeries } from '../engine/learning.js';
import { computeSeriesProfile } from '../engine/series.js';
import { buildTagPatterns } from '../engine/tags.js';
import { episodeTags, seedDetectorsForEval, seedRulesForEval, storyGroups, type CorpusEpisode, type CorpusSeries } from './corpus.js';

/**
 * Replays the labelled datasets as if each episode were arriving new, then compares predictions with the
 * real labels. Everything a hidden episode could leak through (its arc name, its own series profile, tag
 * patterns, rule reliability, later seasons) is held back.
 */

export const BACKTEST_MODES = ['next-episode', 'gap-fill', 'sparse-review', 'batch-tail', 'new-season', 'cold-start'] as const;
export type BacktestMode = (typeof BACKTEST_MODES)[number];

export interface BacktestSample {
  mode: BacktestMode;
  animeId: number;
  group: number;
  number: number;
  truth: Category;
  predicted: Category;
  rawScore: number;
  tier: EvidenceTier | null;
  /** Decided by a format fact rather than scored. The datasets have no OVA or Special labels to compare with. */
  decisive: boolean;
  distribution: Distribution;
}

interface IndexedEpisode {
  series: CorpusSeries;
  episode: CorpusEpisode;
  vector: Float32Array;
  query: Float32Array;
  tags: string[];
  queryTags: string[];
}

class Corpus {
  readonly indexed: IndexedEpisode[] = [];
  readonly byKey = new Map<string, IndexedEpisode>();

  constructor(
    readonly series: CorpusSeries[],
    readonly detectors: TagDetector[],
    embedder: SyncEmbedder,
  ) {
    for (const s of series) {
      for (const episode of s.episodes) {
        const tags = episodeTags(detectors, episode, true);
        const queryTags = episodeTags(detectors, episode, false);
        const known: EpisodeInput = { animeId: s.anime.id, number: episode.number, title: episode.title, description: null, arc: episode.arc, tags };
        const hidden: EpisodeInput = { ...known, arc: null, tags: queryTags };
        const item: IndexedEpisode = {
          series: s,
          episode,
          vector: embedder.embedSync(buildEmbeddingDocument(s.anime, known)),
          query: embedder.embedSync(buildEmbeddingDocument(s.anime, hidden)),
          tags,
          queryTags,
        };
        this.indexed.push(item);
        this.byKey.set(`${s.anime.id}:${episode.number}`, item);
      }
    }
  }
}

function labeled(series: CorpusSeries, episode: CorpusEpisode): LabeledEpisode {
  return {
    animeId: series.anime.id,
    number: episode.number,
    title: episode.title,
    arc: episode.arc,
    category: episode.category,
    trust: 'MEDIUM',
    reviewStatus: 'UNREVIEWED',
  };
}

function buildKnowledge(
  corpus: Corpus,
  visible: (s: CorpusSeries, e: CorpusEpisode) => boolean,
  rules: ClassificationRule[],
  settings: EngineSettings,
  calibration: Calibration | null,
): GlobalKnowledge {
  const learning: LearningSeries[] = [];
  const counts: Partial<Record<Category, number>> = {};
  for (const s of corpus.series) {
    const episodes = s.episodes.filter((e) => visible(s, e));
    if (episodes.length === 0) continue;
    learning.push({
      anime: s.anime,
      episodes: episodes.map((e) => ({
        animeId: s.anime.id,
        number: e.number,
        title: e.title,
        description: null,
        arc: e.arc,
        tags: corpus.byKey.get(`${s.anime.id}:${e.number}`)!.tags,
        category: e.category,
        trust: 'MEDIUM' as const,
      })),
    });
    for (const e of episodes) counts[e.category] = (counts[e.category] ?? 0) + 1;
  }

  const ruleCounts = learnRuleCounts(rules, learning);
  const prior = computePrior(counts);
  return {
    rules: rules.map((r) => ({ ...r, skill: ruleSkill(ruleCounts.get(r.id)!, prior[r.targetCategory]) })),
    settings,
    tagPatterns: buildTagPatterns(learning, settings),
    prior,
    calibration,
    version: 'backtest',
  };
}

/** In-memory twin of the Postgres evidence provider, with the same filtering semantics. */
class MemoryEvidence implements EvidenceProvider {
  /** The run's own predictions, added as LOW trust so a bad guess can only weakly affect the next one. */
  readonly predictions = new Map<number, Array<LabeledEpisode & { vector: Float32Array }>>();

  constructor(
    private readonly corpus: Corpus,
    private readonly knowledge: GlobalKnowledge,
    private readonly visible: (s: CorpusSeries, e: CorpusEpisode) => boolean,
    private readonly titles: Map<number, string>,
  ) {}

  async globalKnowledge() {
    return this.knowledge;
  }

  async seriesEpisodes(animeId: number): Promise<LabeledEpisode[]> {
    const series = this.corpus.series.find((s) => s.anime.id === animeId);
    const known = series ? series.episodes.filter((e) => this.visible(series, e)).map((e) => labeled(series, e)) : [];
    return [...known, ...(this.predictions.get(animeId) ?? [])];
  }

  async seriesProfile(animeId: number): Promise<SeriesProfile | null> {
    const episodes = await this.seriesEpisodes(animeId);
    return episodes.length > 0 ? computeSeriesProfile(animeId, episodes, this.knowledge.settings) : null;
  }

  async searchSimilar(
    vector: Float32Array,
    options: { animeId: number; number: number; limit: number; minSimilarity: number },
  ): Promise<SimilarHit[]> {
    const hits: SimilarHit[] = [];
    for (const item of this.corpus.indexed) {
      if (!this.visible(item.series, item.episode)) continue;
      const similarity = cosine(vector, item.vector);
      if (similarity < options.minSimilarity) continue;
      hits.push({ episode: labeled(item.series, item.episode), animeTitle: item.series.anime.title, similarity });
    }
    for (const prediction of this.predictions.get(options.animeId) ?? []) {
      const similarity = cosine(vector, prediction.vector);
      if (similarity >= options.minSimilarity) {
        hits.push({ episode: prediction, animeTitle: this.titles.get(options.animeId) ?? '', similarity });
      }
    }
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, options.limit);
  }
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Trial {
  /** Episodes being predicted, in airing order. */
  targets: Array<{ series: CorpusSeries; episode: CorpusEpisode }>;
  visible: (s: CorpusSeries, e: CorpusEpisode) => boolean;
  /** Relations allowed for this trial. Sequels haven't aired when a prequel is being classified. */
  allowedRelated: (s: CorpusSeries, related: number) => boolean;
  group: number;
  /** Walk-forward: called after each prediction, revealing that episode's real label. */
  advance?: (number: number) => void;
}

function* trials(corpus: Corpus, mode: BacktestMode): Generator<Trial> {
  const groups = storyGroups(corpus.series);
  const orderIn = (group: CorpusSeries[]) => {
    // Sequels point back through relations; without a franchise order, fall back to the first air year.
    return [...group].sort(
      (a, b) =>
        (a.franchiseOrder ?? 99) - (b.franchiseOrder ?? 99) ||
        (a.anime.seasonYear ?? 9999) - (b.anime.seasonYear ?? 9999) ||
        a.anime.id - b.anime.id,
    );
  };

  for (const [groupIndex, group] of groups.entries()) {
    const ordered = orderIn(group);
    const members = new Set(group);

    if (mode === 'cold-start') {
      yield {
        targets: ordered.flatMap((series) => series.episodes.map((episode) => ({ series, episode }))),
        visible: (s) => !members.has(s),
        allowedRelated: () => false,
        group: groupIndex,
      };
    }

    for (const [position, series] of ordered.entries()) {
      const earlier = new Set(ordered.slice(0, position));
      const later = new Set(ordered.slice(position + 1));
      const earlierIds = new Set([...earlier].map((s) => s.anime.id));

      if (mode === 'new-season' && position > 0) {
        yield {
          targets: series.episodes.map((episode) => ({ series, episode })),
          visible: (s) => s !== series && !later.has(s),
          allowedRelated: (_s, related) => earlierIds.has(related),
          group: groupIndex,
        };
      }

      if (mode === 'next-episode' && series.episodes.length >= 8) {
        // Every earlier episode has been reviewed by the time the next one arrives.
        let revealedUpTo = series.episodes[Math.floor(series.episodes.length * 0.5)]!.number;
        yield {
          targets: series.episodes.filter((e) => e.number >= revealedUpTo).map((episode) => ({ series, episode })),
          visible: (s, e) => (s === series ? e.number < revealedUpTo : !later.has(s)),
          allowedRelated: (_s, related) => earlierIds.has(related),
          group: groupIndex,
          advance: (number) => {
            revealedUpTo = number + 1;
          },
        };
      }

      if (mode === 'sparse-review' && series.episodes.length >= 8) {
        // A person reviews one episode in eight. Does that justify auto-approving the ones between?
        const known = new Set(series.episodes.filter((_, i) => i % 8 === 0).map((e) => e.number));
        yield {
          targets: series.episodes.filter((e) => !known.has(e.number)).map((episode) => ({ series, episode })),
          visible: (s, e) => (s === series ? known.has(e.number) : !later.has(s)),
          allowedRelated: (_s, related) => earlierIds.has(related),
          group: groupIndex,
        };
      }

      if (mode === 'batch-tail' && series.episodes.length >= 8) {
        const cut = series.episodes[Math.floor(series.episodes.length * 0.7)]!.number;
        yield {
          targets: series.episodes.filter((e) => e.number >= cut).map((episode) => ({ series, episode })),
          visible: (s, e) => (s === series ? e.number < cut : !later.has(s)),
          allowedRelated: (_s, related) => earlierIds.has(related),
          group: groupIndex,
        };
      }

      if (mode === 'gap-fill' && series.episodes.length >= 8) {
        const random = mulberry32(series.anime.id);
        const hidden = new Set(series.episodes.filter(() => random() < 0.2).map((e) => e.number));
        if (hidden.size === 0) continue;
        yield {
          targets: series.episodes.filter((e) => hidden.has(e.number)).map((episode) => ({ series, episode })),
          visible: (s, e) => s !== series || !hidden.has(e.number),
          allowedRelated: () => true,
          group: groupIndex,
        };
      }
    }
  }
}

/** Lets the backtest compare embedding models. Asynchronous models precompute into a lookup first. */
export interface SyncEmbedder {
  embedSync(document: EmbeddingDocument): Float32Array;
}

export interface BacktestOptions {
  embedder?: SyncEmbedder;
  settings?: EngineSettings;
  modes?: readonly BacktestMode[];
  calibration?: Calibration | null;
}

export async function runBacktest(series: CorpusSeries[], options: BacktestOptions = {}): Promise<BacktestSample[]> {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const hashing = new HashingEmbedder();
  const corpus = new Corpus(series, seedDetectorsForEval(), options.embedder ?? hashing);
  const rules = seedRulesForEval();
  const samples: BacktestSample[] = [];
  const titles = new Map(series.map((s) => [s.anime.id, s.anime.title]));

  for (const mode of options.modes ?? BACKTEST_MODES) {
    for (const trial of trials(corpus, mode)) {
      const knowledge = buildKnowledge(corpus, trial.visible, rules, settings, options.calibration ?? null);
      const evidence = new MemoryEvidence(corpus, knowledge, trial.visible, titles);
      const engine = new HybridEngine(evidence, hashing);

      for (const { series: s, episode } of trial.targets) {
        const item = corpus.byKey.get(`${s.anime.id}:${episode.number}`)!;
        const anime: AnimeMeta = {
          ...s.anime,
          relatedAnimeIds: s.anime.relatedAnimeIds.filter((id) => trial.allowedRelated(s, id)),
        };
        const prediction: Prediction = await engine.classifyEpisode({
          anime,
          episode: {
            animeId: s.anime.id,
            number: episode.number,
            title: episode.title,
            description: null,
            arc: null,
            tags: item.queryTags,
          },
          vector: item.query,
        });

        samples.push({
          mode,
          animeId: s.anime.id,
          group: trial.group,
          number: episode.number,
          truth: episode.category,
          predicted: prediction.category,
          rawScore: prediction.rawScore,
          tier: prediction.evidenceTier,
          decisive: prediction.contributors.length === 0,
          distribution: prediction.distribution,
        });

        trial.advance?.(episode.number);
        if (mode !== 'gap-fill' && mode !== 'next-episode') {
          const list = evidence.predictions.get(s.anime.id) ?? [];
          list.push({
            animeId: s.anime.id,
            number: episode.number,
            title: episode.title,
            arc: null,
            category: prediction.category,
            trust: 'LOW',
            reviewStatus: 'UNREVIEWED',
            vector: item.query,
          });
          evidence.predictions.set(s.anime.id, list);
        }
      }
    }
  }
  return samples;
}

export interface ClassMetrics {
  support: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface BandMetrics {
  episodes: number;
  share: number;
  accuracy: number;
}

export interface ModeReport {
  mode: BacktestMode | 'all';
  episodes: number;
  decisiveExcluded: number;
  accuracy: number;
  /** Always predicting the most common label in this set. */
  baselineAccuracy: number;
  macroF1: number;
  baselineMacroF1: number;
  perClass: Record<string, ClassMetrics>;
  bands: Record<'AUTO_APPROVED' | 'SUGGESTED' | 'NEEDS_REVIEW', BandMetrics>;
  /** Filler predicted as canon: the failure that makes a viewer sit through filler, or skip story. */
  fillerMissedAsCanon: number;
  canonSkippedAsFiller: number;
}

export function scoreSamples(
  mode: ModeReport['mode'],
  samples: BacktestSample[],
  confidenceOf: (s: BacktestSample) => number,
  settings: EngineSettings = DEFAULT_SETTINGS,
): ModeReport {
  const scored = samples.filter((s) => !s.decisive);
  const labels = CATEGORIES.filter((c) => scored.some((s) => s.truth === c || s.predicted === c));
  const correct = scored.filter((s) => s.truth === s.predicted).length;

  const f1Of = (predict: (s: BacktestSample) => Category) => {
    const perClass: Record<string, ClassMetrics> = {};
    for (const label of labels) {
      const tp = scored.filter((s) => s.truth === label && predict(s) === label).length;
      const fp = scored.filter((s) => s.truth !== label && predict(s) === label).length;
      const fn = scored.filter((s) => s.truth === label && predict(s) !== label).length;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      perClass[label] = {
        support: tp + fn,
        precision,
        recall,
        f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
      };
    }
    // Only classes that really occur: a class with no true examples has no meaningful recall.
    const present = Object.values(perClass).filter((m) => m.support > 0);
    return { perClass, macro: present.reduce((sum, m) => sum + m.f1, 0) / (present.length || 1) };
  };

  const counts = new Map<Category, number>();
  for (const s of scored) counts.set(s.truth, (counts.get(s.truth) ?? 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'CANON';

  const { perClass, macro } = f1Of((s) => s.predicted);
  const baseline = f1Of(() => majority);

  const band = (name: keyof ModeReport['bands']): BandMetrics => {
    const inBand = scored.filter((s) => decide(confidenceOf(s), settings.thresholds) === name);
    return {
      episodes: inBand.length,
      share: inBand.length / (scored.length || 1),
      accuracy: inBand.filter((s) => s.truth === s.predicted).length / (inBand.length || 1),
    };
  };

  return {
    mode,
    episodes: scored.length,
    decisiveExcluded: samples.length - scored.length,
    accuracy: correct / (scored.length || 1),
    baselineAccuracy: (counts.get(majority) ?? 0) / (scored.length || 1),
    macroF1: macro,
    baselineMacroF1: baseline.macro,
    perClass,
    bands: { AUTO_APPROVED: band('AUTO_APPROVED'), SUGGESTED: band('SUGGESTED'), NEEDS_REVIEW: band('NEEDS_REVIEW') },
    fillerMissedAsCanon: scored.filter((s) => s.truth === 'FILLER' && s.predicted === 'CANON').length,
    canonSkippedAsFiller: scored.filter((s) => s.truth === 'CANON' && s.predicted === 'FILLER').length,
  };
}

function toCalibrationSamples(samples: BacktestSample[]) {
  return samples.map((s) => ({ score: s.rawScore, correct: s.truth === s.predicted, tier: s.tier ?? ('none' as const) }));
}

/** Fits on one half of the story groups, applies to the other, then swaps. No episode is scored by a curve it trained. */
export function crossFitCalibration(samples: BacktestSample[], settings: EngineSettings = DEFAULT_SETTINGS): Map<BacktestSample, number> {
  const scored = samples.filter((s) => !s.decisive);
  const curves = [
    fitCalibration(toCalibrationSamples(scored.filter((s) => s.group % 2 === 1)), 'cross-fit-a'),
    fitCalibration(toCalibrationSamples(scored.filter((s) => s.group % 2 === 0)), 'cross-fit-b'),
  ];
  return new Map(scored.map((s) => [s, finalConfidence(curves[s.group % 2]!, s.tier ?? 'none', s.rawScore, settings)]));
}

export function fitFinalCalibration(samples: BacktestSample[], version: string): Calibration {
  return fitCalibration(toCalibrationSamples(samples.filter((s) => !s.decisive)), version);
}
