import type { ClassificationRule, TagDetector } from '../domain/rules.js';
import type { AnimeMeta, Category, Distribution, EpisodeInput, LabeledEpisode, TrustLevel } from '../domain/types.js';
import { CATEGORIES, emptyDistribution, normalize } from '../domain/types.js';
import { matchesCondition } from './rules.js';

/**
 * Pure learning functions, shared by the database rebuild and the backtest so the numbers the backtest
 * reports describe the code that runs in production.
 */

/** Curated imports only use these four labels, so they can't confirm or refute a rule targeting anything else. */
export const IMPORT_VOCABULARY: ReadonlySet<Category> = new Set(['CANON', 'MIXED', 'FILLER', 'ANIME_CANON']);

/** Curated labels teach rules, but at a discount compared with an actual human decision. */
const MEDIUM_TRUST_DISCOUNT = 0.5;

export interface RuleOutcomeCounts {
  highFires: number;
  highCorrect: number;
  mediumFires: number;
  mediumCorrect: number;
}

/** Beta posterior mean of "the rule's target was right". A weak 3/4 prior trusts a new rule until it has a record. */
export function ruleAccuracy(counts: RuleOutcomeCounts): number {
  const fires = counts.highFires + counts.mediumFires * MEDIUM_TRUST_DISCOUNT;
  const correct = counts.highCorrect + counts.mediumCorrect * MEDIUM_TRUST_DISCOUNT;
  return (correct + 1.5) / (fires + 2);
}

/** Accuracy beyond what always guessing the target would score (Cohen's kappa form), clamped to 0-1. */
export function ruleSkill(counts: RuleOutcomeCounts, targetPrior: number): number {
  return Math.max(0, Math.min(1, (ruleAccuracy(counts) - targetPrior) / (1 - targetPrior)));
}

export function emptyRuleCounts(): RuleOutcomeCounts {
  return { highFires: 0, highCorrect: 0, mediumFires: 0, mediumCorrect: 0 };
}

export interface LearningSeries {
  anime: AnimeMeta;
  episodes: Array<EpisodeInput & { category: Category; trust: TrustLevel }>;
}

/** LOW-trust predictions are never counted, or the engine would grade its own homework. */
export function learnRuleCounts(rules: ClassificationRule[], series: LearningSeries[]): Map<number, RuleOutcomeCounts> {
  const results = new Map<number, RuleOutcomeCounts>(rules.map((r) => [r.id, emptyRuleCounts()]));
  const scoring = rules.filter((r) => !r.decisive);

  for (const { anime, episodes } of series) {
    for (const episode of episodes) {
      if (episode.trust === 'LOW') continue;
      for (const rule of scoring) {
        if (episode.trust === 'MEDIUM' && !IMPORT_VOCABULARY.has(rule.targetCategory)) continue;
        if (!matchesCondition(rule.condition, { anime, episode })) continue;
        const counts = results.get(rule.id)!;
        const correct = rule.targetCategory === episode.category ? 1 : 0;
        if (episode.trust === 'HIGH') {
          counts.highFires += 1;
          counts.highCorrect += correct;
        } else {
          counts.mediumFires += 1;
          counts.mediumCorrect += correct;
        }
      }
    }
  }
  return results;
}

/** Floored, so a category with no labels yet (OVA, Special, Movie today) still has a small base rate. */
export function computePrior(counts: Partial<Record<Category, number>>): Distribution {
  const total = CATEGORIES.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
  const prior = emptyDistribution();
  for (const c of CATEGORIES) prior[c] = Math.max(counts[c] ?? 0, total * 0.005, 1);
  return normalize(prior);
}

const compiled = new Map<string, RegExp>();

/** Episode-level tags come from text the episode actually has. AniList's tags describe the whole series. */
export function detectEpisodeTags(
  detectors: TagDetector[],
  text: { title: string | null; description: string | null; arc: string | null },
): string[] {
  const haystack = [text.title, text.description, text.arc].filter(Boolean).join('\n');
  if (!haystack) return [];
  const tags: string[] = [];
  for (const detector of detectors) {
    if (!detector.enabled) continue;
    let regex = compiled.get(detector.pattern);
    if (!regex) {
      regex = new RegExp(detector.pattern, 'iu');
      compiled.set(detector.pattern, regex);
    }
    if (regex.test(haystack)) tags.push(detector.tag);
  }
  return tags;
}

export function toLabeled(animeId: number, e: EpisodeInput & { category: Category; trust: TrustLevel }): LabeledEpisode {
  return {
    animeId,
    number: e.number,
    title: e.title,
    arc: e.arc,
    category: e.category,
    trust: e.trust,
    reviewStatus: e.trust === 'HIGH' ? 'APPROVED' : 'UNREVIEWED',
  };
}

