import type { EngineSettings } from '../domain/settings.js';
import type { Distribution, LabeledEpisode } from '../domain/types.js';
import { CATEGORIES, CATEGORY_LABELS, emptyDistribution, normalize, topCategory } from '../domain/types.js';
import type { ContributorResult } from './contributor.js';
import type { SeriesProfile } from './evidence.js';

export function computeSeriesProfile(animeId: number, episodes: LabeledEpisode[], settings: EngineSettings): SeriesProfile {
  const distribution = emptyDistribution();
  let effectiveCount = 0;
  for (const e of episodes) {
    const weight = settings.trustWeights[e.trust];
    distribution[e.category] += weight;
    effectiveCount += weight;
  }
  normalize(distribution);
  return { animeId, distribution, effectiveCount, labeledCount: episodes.length };
}

export function seriesContributor(
  own: SeriesProfile | null,
  related: SeriesProfile[],
  settings: EngineSettings,
): ContributorResult {
  const { shrinkage, relatedDiscount } = settings.series;
  const combined: Distribution = emptyDistribution();
  let evidence = 0;
  let borrowed = 0;

  if (own) {
    for (const c of CATEGORIES) combined[c] += own.distribution[c] * own.effectiveCount;
    evidence += own.effectiveCount;
  }
  for (const profile of related) {
    const count = profile.effectiveCount * relatedDiscount;
    for (const c of CATEGORIES) combined[c] += profile.distribution[c] * count;
    evidence += count;
    borrowed += count;
  }
  normalize(combined);

  const reasons: string[] = [];
  if (evidence > 0) {
    const top = topCategory(combined);
    const percent = Math.round(combined[top] * 100);
    const ownUnreviewed = own !== null && own.effectiveCount <= own.labeledCount * settings.trustWeights.LOW + 1e-6;
    reasons.push(
      borrowed >= evidence / 2
        ? `Related seasons are ${percent}% ${CATEGORY_LABELS[top]}`
        : ownUnreviewed
          ? `Unreviewed predictions for this series so far are ${percent}% ${CATEGORY_LABELS[top]}`
          : `Series profile indicates ${percent}% ${CATEGORY_LABELS[top]} probability`,
    );
  }

  return { name: 'series', distribution: combined, strength: evidence / (evidence + shrinkage), reasons };
}
