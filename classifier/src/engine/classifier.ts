import type { AnimeMeta, Category, ContributorName, Decision, Distribution, EpisodeInput } from '../domain/types.js';
import type { ArcRun, EvidenceTier } from './arc.js';
import type { RuleHit } from './rules.js';
import type { SimilarEpisodeExplanation } from './similarity.js';

export interface ClassificationRequest {
  anime: AnimeMeta;
  episode: EpisodeInput;
  /** Precomputed embedding. Engines that want one compute it when absent. */
  vector?: Float32Array;
}

export interface ContributorScore {
  name: ContributorName;
  weight: number;
  strength: number;
  /** Probability this contributor gave the final category. */
  support: number;
  /** Share of the evidence separating the final category from the runner-up, -1 to 1. Negative means it argued against. */
  share: number;
  topCategory: Category;
  distribution: Distribution;
  reasons: string[];
}

/** What every engine must produce. The HTTP contract derives from this, so swapping engines can't break it. */
export interface Prediction {
  category: Category;
  /** Calibrated, 0-1. */
  confidence: number;
  /** Before calibration. */
  rawScore: number;
  /** How close the nearest trusted labels are. Null when a decisive fact settled it. */
  evidenceTier: EvidenceTier | null;
  decision: Decision;
  distribution: Distribution;
  reasons: string[];
  contributors: ContributorScore[];
  supportingRules: RuleHit[];
  similarEpisodes: SimilarEpisodeExplanation[];
  arc: ArcRun | null;
  engine: { name: string; version: string };
}

/**
 * The seam for future engines (gradient boosting, a tuned transformer, RAG, an ensemble). Register an
 * implementation and set CLASSIFIER_ENGINE; nothing else changes.
 */
export interface ClassifierEngine {
  readonly name: string;
  readonly version: string;
  classifyEpisode(request: ClassificationRequest): Promise<Prediction>;
}

export type EngineFactory<Deps> = (deps: Deps) => ClassifierEngine;

export class EngineRegistry<Deps> {
  private readonly factories = new Map<string, EngineFactory<Deps>>();

  register(name: string, factory: EngineFactory<Deps>): this {
    this.factories.set(name, factory);
    return this;
  }

  create(name: string, deps: Deps): ClassifierEngine {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Unknown classifier engine "${name}". Registered: ${[...this.factories.keys()].join(', ')}`);
    }
    return factory(deps);
  }
}
