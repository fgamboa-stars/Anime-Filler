import type { EngineSettings } from '../domain/settings.js';
import type { Decision } from '../domain/types.js';

/** >90 auto-approves, 70-90 is a suggestion, below that a human decides. Compared on the percentage shown. */
export function decide(confidence: number, thresholds: EngineSettings['thresholds']): Decision {
  const percent = Math.round(confidence * 100);
  if (percent > thresholds.autoApprove) return 'AUTO_APPROVED';
  if (percent >= thresholds.suggest) return 'SUGGESTED';
  return 'NEEDS_REVIEW';
}
