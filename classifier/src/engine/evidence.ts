import type { ClassificationRule } from '../domain/rules.js';
import type { EngineSettings } from '../domain/settings.js';
import type { Category, Distribution, LabeledEpisode } from '../domain/types.js';
import type { Calibration } from './calibration.js';

/** Learned P(category | tag) counts. Trust-weighted, so low-trust data never appears here. */
export interface TagPattern {
  tag: string;
  scope: 'episode' | 'series';
  counts: Partial<Record<Category, number>>;
  total: number;
}

export interface SeriesProfile {
  animeId: number;
  distribution: Distribution;
  /** Trust-weighted example count: how far this profile can be believed. */
  effectiveCount: number;
  labeledCount: number;
}

export interface GlobalKnowledge {
  rules: ClassificationRule[];
  settings: EngineSettings;
  tagPatterns: Map<string, TagPattern>;
  prior: Distribution;
  calibration: Calibration | null;
  /** Changes whenever rules, settings or calibration change. Part of the decision cache key. */
  version: string;
}

export interface SimilarHit {
  episode: LabeledEpisode;
  animeTitle: string;
  similarity: number;
}

/** Everything the engine reads. Postgres in production, in-memory for the backtest. */
export interface EvidenceProvider {
  globalKnowledge(): Promise<GlobalKnowledge>;
  /** Other classified episodes of this series, in any order. */
  seriesEpisodes(animeId: number): Promise<LabeledEpisode[]>;
  seriesProfile(animeId: number): Promise<SeriesProfile | null>;
  /** Nearest classified episodes. Same-series hits may be any trust; other series must be HIGH or MEDIUM. */
  searchSimilar(
    vector: Float32Array,
    options: { animeId: number; number: number; limit: number; minSimilarity: number },
  ): Promise<SimilarHit[]>;
}
