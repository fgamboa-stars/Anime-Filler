import type { EngineSettings } from '../domain/settings.js';
import type { Category, ContributorName, Distribution } from '../domain/types.js';
import { CATEGORIES, CATEGORY_LABELS, emptyDistribution, normalize, topCategory } from '../domain/types.js';
import { buildEmbeddingDocument, type Embedder } from '../embedding/embedder.js';
import { arcContributor, evidenceTier } from './arc.js';
import { finalConfidence } from './calibration.js';
import type { ClassificationRequest, ClassifierEngine, ContributorScore, Prediction } from './classifier.js';
import type { ContributorResult } from './contributor.js';
import { decide } from './decision.js';
import type { EvidenceProvider } from './evidence.js';
import { evaluateRules, ruleLogOdds, type RuleHit } from './rules.js';
import { seriesContributor } from './series.js';
import { similarityContributor } from './similarity.js';
import { tagContributor } from './tags.js';

type PoolName = keyof EngineSettings['weights'];

const STORY_CATEGORIES: ReadonlySet<Category> = new Set(['CANON', 'MIXED', 'FILLER', 'ANIME_CANON']);

export const HYBRID_ENGINE_NAME = 'hybrid';
export const HYBRID_ENGINE_VERSION = '1.0.0';

/** Confidence for a decisive rule: it's a fact from AniList, not an estimate, so it skips calibration. */
const DECISIVE_CONFIDENCE = 0.99;

/** A rule below this hardly moved the result. It stays in supportingRules, but isn't offered as a reason. */
const NOTABLE_RULE_POINTS = 1;

/** How a contributor moves a category, in nats. Its opinion is softened by strength: no evidence means no movement. */
function logLift(result: ContributorResult, c: Category, prior: Distribution, floor: number): number {
  const opinion = Math.max(result.strength * result.distribution[c] + (1 - result.strength) * prior[c], floor * prior[c]);
  const lift = Math.log(opinion / prior[c]);
  // Neighbours not being recaps says nothing about whether this one is, so these layers can only argue for
  // an episode-kind category, never against it. Otherwise a recap inside a canon arc could never be Special.
  return STORY_CATEGORIES.has(c) ? lift : Math.max(0, lift);
}

/**
 * Log-odds pool against the base rate. A contributor only moves the result by how far it differs from the
 * prior, so one that always says "canon" on a mostly-canon catalog adds nothing, and strong local evidence
 * can outvote the base rate. Rule points are already log-odds and are added directly.
 */
export function combine(
  results: ContributorResult[],
  ruleOdds: Distribution,
  settings: EngineSettings,
  prior: Distribution,
): Distribution {
  const { sharpness, floor } = settings.pool;
  const logScores = emptyDistribution();
  for (const c of CATEGORIES) {
    logScores[c] = Math.log(prior[c]) + ruleOdds[c];
    for (const result of results) {
      const weight = settings.weights[result.name as PoolName];
      logScores[c] += sharpness * weight * logLift(result, c, prior, floor);
    }
  }
  const peak = Math.max(...CATEGORIES.map((c) => logScores[c]));
  const distribution = emptyDistribution();
  for (const c of CATEGORIES) distribution[c] = Math.exp(logScores[c] - peak);
  return normalize(distribution);
}

export class HybridEngine implements ClassifierEngine {
  readonly name = HYBRID_ENGINE_NAME;
  readonly version = HYBRID_ENGINE_VERSION;

  constructor(
    private readonly provider: EvidenceProvider,
    private readonly embedder: Embedder,
  ) {}

  async classifyEpisode({ anime, episode, vector }: ClassificationRequest): Promise<Prediction> {
    const knowledge = await this.provider.globalKnowledge();
    const { settings, prior } = knowledge;

    const ruleHits = evaluateRules(knowledge.rules, { anime, episode });
    const decisive = ruleHits.filter((h) => h.decisive).sort((a, b) => b.scoreValue - a.scoreValue)[0];
    if (decisive) {
      const distribution = emptyDistribution();
      distribution[decisive.targetCategory] = 1;
      return {
        category: decisive.targetCategory,
        confidence: DECISIVE_CONFIDENCE,
        rawScore: 1,
        evidenceTier: null,
        decision: decide(DECISIVE_CONFIDENCE, settings.thresholds),
        distribution,
        reasons: [decisive.explanation],
        contributors: [],
        supportingRules: [decisive],
        similarEpisodes: [],
        arc: null,
        engine: { name: this.name, version: this.version },
      };
    }

    const queryVector = vector ?? (await this.embedder.embed([buildEmbeddingDocument(anime, episode)]))[0]!;
    const [seriesEpisodes, ownProfile, relatedProfiles, similarHits] = await Promise.all([
      this.provider.seriesEpisodes(anime.id),
      this.provider.seriesProfile(anime.id),
      Promise.all(anime.relatedAnimeIds.map((id) => this.provider.seriesProfile(id))),
      this.provider.searchSimilar(queryVector, {
        animeId: anime.id,
        number: episode.number,
        limit: settings.similarity.topK,
        minSimilarity: settings.similarity.minSimilarity,
      }),
    ]);

    const ruleOdds = ruleLogOdds(ruleHits, settings);
    const relatedFound = relatedProfiles.filter((p): p is NonNullable<typeof p> => p !== null);
    const similarity = similarityContributor(similarHits, anime.id, settings);
    const arc = arcContributor(episode, seriesEpisodes, settings);
    const series = seriesContributor(ownProfile, relatedFound, settings);
    const tags = tagContributor(anime, episode, knowledge.tagPatterns, prior, settings);

    const results = [similarity, arc, series, tags];
    const distribution = combine(results, ruleOdds, settings, prior);
    const category = topCategory(distribution);
    const runnerUp = CATEGORIES.filter((c) => c !== category).reduce((a, b) => (distribution[b] > distribution[a] ? b : a));
    const rawScore = distribution[category];
    const relatedTrusted = relatedFound.some((p) => p.effectiveCount > p.labeledCount * settings.trustWeights.LOW + 1e-6);
    const tier = evidenceTier(episode, seriesEpisodes, relatedTrusted, settings);
    const confidence = finalConfidence(knowledge.calibration, tier, rawScore, settings);

    return {
      category,
      confidence,
      rawScore,
      evidenceTier: tier,
      decision: decide(confidence, settings.thresholds),
      distribution,
      reasons: explain(results, ruleHits, category),
      contributors: scoreContributors(results, ruleHits, ruleOdds, settings, prior, category, runnerUp),
      supportingRules: ruleHits,
      similarEpisodes: similarity.explanations,
      arc: arc.run,
      engine: { name: this.name, version: this.version },
    };
  }
}

/** Explains the result in the pool's own terms: how much each layer separated the winner from the runner-up. */
function scoreContributors(
  results: ContributorResult[],
  ruleHits: RuleHit[],
  ruleOdds: Distribution,
  settings: EngineSettings,
  prior: Distribution,
  category: Category,
  runnerUp: Category,
): ContributorScore[] {
  const { sharpness, floor } = settings.pool;
  const margins = new Map<ContributorName, number>(
    results.map((r) => {
      const weight = settings.weights[r.name as PoolName];
      return [r.name, sharpness * weight * (logLift(r, category, prior, floor) - logLift(r, runnerUp, prior, floor))];
    }),
  );
  margins.set('rules', ruleOdds[category] - ruleOdds[runnerUp]);
  const total = [...margins.values()].reduce((sum, m) => sum + Math.abs(m), 0) || 1;
  const round = (x: number) => Number(x.toFixed(4));

  const ruleDistribution = emptyDistribution();
  for (const hit of ruleHits) ruleDistribution[hit.targetCategory] += Math.max(hit.appliedScore, 0);
  normalize(ruleDistribution);
  const ruleEvidence = ruleHits.reduce((sum, h) => sum + Math.abs(h.appliedScore), 0);

  return [
    {
      name: 'rules' as const,
      weight: 1,
      strength: round(Math.min(1, ruleEvidence / (settings.rules.pointsPerNat * 5))),
      support: round(ruleDistribution[category]),
      share: round(margins.get('rules')! / total),
      topCategory: topCategory(ruleDistribution),
      distribution: ruleDistribution,
      reasons: ruleHits.filter((h) => h.appliedScore > 0).map((h) => h.explanation),
    },
    ...results.map((r) => ({
      name: r.name,
      weight: settings.weights[r.name as PoolName],
      strength: round(r.strength),
      support: round(r.distribution[category]),
      share: round(margins.get(r.name)! / total),
      topCategory: topCategory(r.distribution),
      distribution: r.distribution,
      reasons: r.reasons,
    })),
  ];
}

/** Strongest backers first, then any contributor pulling elsewhere, so the disagreement is visible too. */
function explain(results: ContributorResult[], ruleHits: RuleHit[], category: Category): string[] {
  const felt = ruleHits.filter((h) => h.appliedScore >= NOTABLE_RULE_POINTS);
  const ruleReasons = felt.filter((h) => h.targetCategory === category).map((h) => h.explanation);
  const active = results.filter((r) => r.strength > 0.05 && r.reasons.length > 0);
  const backing = active
    .filter((r) => topCategory(r.distribution) === category)
    .sort((a, b) => b.strength * b.distribution[category] - a.strength * a.distribution[category]);
  const reasons = [...ruleReasons, ...backing.flatMap((r) => r.reasons)];

  for (const hit of felt) {
    if (hit.targetCategory !== category) reasons.push(`Against: ${hit.explanation}`);
  }
  for (const r of active) {
    if (topCategory(r.distribution) !== category) {
      reasons.push(`Against: ${r.reasons[0]} (leans ${CATEGORY_LABELS[topCategory(r.distribution)]})`);
    }
  }
  return reasons.length > 0 ? reasons : ['Little evidence available; prediction follows the global base rate'];
}
