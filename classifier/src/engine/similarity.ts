import type { EngineSettings } from '../domain/settings.js';
import type { Category, TrustLevel } from '../domain/types.js';
import { CATEGORY_LABELS, emptyDistribution, normalize, topCategory } from '../domain/types.js';
import { saturate, type ContributorResult } from './contributor.js';
import type { SimilarHit } from './evidence.js';

export interface SimilarEpisodeExplanation {
  animeId: number;
  animeTitle: string;
  episode: number;
  title: string | null;
  classification: Category;
  similarity: number;
  trust: TrustLevel;
  /** Why this episode was picked, in words. */
  selectedBecause: string;
}

function explainSelection(hit: SimilarHit, animeId: number): string {
  const scope = hit.episode.animeId === animeId ? 'same series' : `from ${hit.animeTitle}`;
  const label =
    hit.episode.trust === 'HIGH'
      ? 'human-reviewed'
      : hit.episode.trust === 'MEDIUM'
        ? 'curated label'
        : 'unreviewed prediction, counted weakly';
  return `Title and metadata ${Math.round(hit.similarity * 100)}% similar; ${scope}; ${label}`;
}

export function similarityContributor(
  hits: SimilarHit[],
  animeId: number,
  settings: EngineSettings,
): ContributorResult & { explanations: SimilarEpisodeExplanation[] } {
  const { sharpness, saturation, sameSeriesBoost } = settings.similarity;
  const distribution = emptyDistribution();
  const reviewedCounts = emptyDistribution();
  let evidence = 0;

  for (const hit of hits) {
    const scope = hit.episode.animeId === animeId ? sameSeriesBoost : 1;
    const vote = hit.similarity ** sharpness * settings.trustWeights[hit.episode.trust] * scope;
    distribution[hit.episode.category] += vote;
    evidence += vote;
    if (hit.episode.trust === 'HIGH') reviewedCounts[hit.episode.category] += 1;
  }
  normalize(distribution);

  const reasons: string[] = [];
  if (hits.length > 0) {
    const top = topCategory(distribution);
    const reviewed = reviewedCounts[top];
    const agreeing = hits.filter((h) => h.episode.category === top).length;
    reasons.push(
      reviewed > 0
        ? `Matched ${reviewed} previously reviewed ${CATEGORY_LABELS[top]} episode${reviewed === 1 ? '' : 's'} (${agreeing} of ${hits.length} nearest overall)`
        : `${agreeing} of ${hits.length} most similar episodes are ${CATEGORY_LABELS[top]}, none human-reviewed yet`,
    );
  }

  return {
    name: 'similarity',
    distribution,
    strength: saturate(evidence, saturation),
    reasons,
    explanations: hits.map((hit) => ({
      animeId: hit.episode.animeId,
      animeTitle: hit.animeTitle,
      episode: hit.episode.number,
      title: hit.episode.title,
      classification: hit.episode.category,
      similarity: Number(hit.similarity.toFixed(4)),
      trust: hit.episode.trust,
      selectedBecause: explainSelection(hit, animeId),
    })),
  };
}
