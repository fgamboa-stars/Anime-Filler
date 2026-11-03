import type { EngineSettings } from '../domain/settings.js';
import type { EvidenceTier } from './arc.js';

/**
 * Maps raw engine scores to observed accuracy, so "94%" means right about 94% of the time. Fitted by
 * the backtest with isotonic regression (pool adjacent violators) and stored as knots.
 */
export interface CalibrationCurve {
  /** Sorted by score. Values never decrease. */
  knots: Array<[score: number, accuracy: number]>;
}

export interface Calibration {
  version: string;
  /** One curve per evidence tier: 80% with trusted neighbours and 80% without them are different claims. */
  tiers: Partial<Record<EvidenceTier, CalibrationCurve>>;
}

export interface CalibrationSample {
  score: number;
  correct: boolean;
  tier: EvidenceTier;
}

/** Bins before pooling so the curve can't overfit a single episode. */
export function fitCurve(samples: Array<Pick<CalibrationSample, 'score' | 'correct'>>, binSize = 50): CalibrationCurve {
  const sorted = [...samples].sort((a, b) => a.score - b.score);
  const blocks: Array<{ score: number; hits: number; n: number }> = [];

  for (let i = 0; i < sorted.length; i += binSize) {
    const bin = sorted.slice(i, i + binSize);
    blocks.push({
      score: bin.reduce((sum, x) => sum + x.score, 0) / bin.length,
      hits: bin.filter((x) => x.correct).length,
      n: bin.length,
    });
    // Merge backwards while the curve would decrease.
    while (blocks.length > 1) {
      const b = blocks.at(-1)!;
      const a = blocks.at(-2)!;
      if (a.hits / a.n < b.hits / b.n) break;
      a.score = (a.score * a.n + b.score * b.n) / (a.n + b.n);
      a.hits += b.hits;
      a.n += b.n;
      blocks.pop();
    }
  }
  // Laplace smoothing: a block with 50/50 right is good evidence, not proof of 100%.
  return { knots: blocks.map((b) => [b.score, (b.hits + 1) / (b.n + 2)]) };
}

export function fitCalibration(samples: CalibrationSample[], version: string): Calibration {
  const tiers: Calibration['tiers'] = {};
  for (const tier of ['bracketed', 'adjacent', 'series', 'none'] as const) {
    const inTier = samples.filter((s) => s.tier === tier);
    if (inTier.length > 0) tiers[tier] = fitCurve(inTier);
  }
  return { version, tiers };
}

/**
 * Without a curve for this tier, the raw score is capped below auto-approval: an uncalibrated score has
 * no track record, so a person should look at it.
 */
export const UNCALIBRATED_CAP = 0.85;

/**
 * The confidence a prediction reports. Tiers that may not auto-approve are held at the threshold, so the number
 * shown always agrees with the band. The engine and the backtest both use this, so what's measured is what runs.
 */
export function finalConfidence(calibration: Calibration | null, tier: EvidenceTier, score: number, settings: EngineSettings): number {
  const calibrated = applyCalibration(calibration, tier, score);
  const { autoApprove, autoApproveTiers } = settings.thresholds;
  return autoApproveTiers.includes(tier) ? calibrated : Math.min(calibrated, autoApprove / 100);
}

export function applyCalibration(calibration: Calibration | null, tier: EvidenceTier, score: number): number {
  const knots = calibration?.tiers[tier]?.knots;
  if (!knots || knots.length === 0) return Math.min(score, UNCALIBRATED_CAP);
  const first = knots[0]!;
  const last = knots.at(-1)!;
  if (score <= first[0]) return first[1];
  if (score >= last[0]) return last[1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    if (score <= x1) {
      const [x0, y0] = knots[i - 1]!;
      return y0 + ((score - x0) / (x1 - x0 || 1)) * (y1 - y0);
    }
  }
  return last[1];
}
