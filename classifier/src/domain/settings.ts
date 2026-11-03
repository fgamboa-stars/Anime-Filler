import type { EvidenceTier } from '../engine/arc.js';
import type { ContributorName, TrustLevel } from './types.js';

/** Tunable engine parameters. Stored in `engine_settings`; these defaults seed a new database. */
export interface EngineSettings {
  /** Rules are absent on purpose: their points are already log-odds, so they need no second weight. */
  weights: Record<Exclude<ContributorName, 'rules'>, number>;
  thresholds: {
    autoApprove: number;
    suggest: number;
    /**
     * Only these tiers may auto-approve. Earlier seasons being canon says little about this one: the backtest
     * had such predictions right 41% of the time at "auto-approve" confidence, on shows like Dragon Ball GT.
     */
    autoApproveTiers: EvidenceTier[];
  };
  /** Overall sharpness of the log-odds pool. The calibration curve absorbs what's left of any scale error. */
  pool: { sharpness: number; floor: number };
  /** How much an example counts as evidence. This is the core of the anti-drift protection. */
  trustWeights: Record<TrustLevel, number>;
  /** Rule points per nat of log-odds: lower makes every rule count for more. */
  rules: { pointsPerNat: number };
  similarity: {
    topK: number;
    minSimilarity: number;
    sharpness: number;
    saturation: number;
    sameSeriesBoost: number;
  };
  arc: { window: number; decay: number; saturation: number; enclosedBoost: number; maxInterruption: number };
  series: { shrinkage: number; relatedDiscount: number };
  tags: { minSupport: number; smoothing: number; episodeTagScale: number; seriesTagScale: number; saturation: number };
}

export const DEFAULT_SETTINGS: EngineSettings = {
  weights: { similarity: 0.1, arc: 0.55, series: 0.25, tags: 0.1 },
  thresholds: { autoApprove: 90, suggest: 70, autoApproveTiers: ['bracketed', 'adjacent'] },
  pool: { sharpness: 2, floor: 0.02 },
  trustWeights: { HIGH: 1, MEDIUM: 0.6, LOW: 0.1 },
  rules: { pointsPerNat: 3 },
  similarity: { topK: 20, minSimilarity: 0.15, sharpness: 2, saturation: 1.5, sameSeriesBoost: 1.5 },
  arc: { window: 6, decay: 0.7, saturation: 0.8, enclosedBoost: 3, maxInterruption: 1 },
  series: { shrinkage: 12, relatedDiscount: 0.5 },
  tags: { minSupport: 5, smoothing: 10, episodeTagScale: 1, seriesTagScale: 1, saturation: 50 },
};
