import type { EpisodeRow } from '../app/catalog.js';
import type { Queryable } from '../db/database.js';
import type { Category, Decision, Origin, ReviewStatus, TrustLevel } from '../domain/types.js';
import { CATEGORY_LABELS } from '../domain/types.js';
import type { ContributorScore, Prediction } from '../engine/classifier.js';
import type { RuleHit } from '../engine/rules.js';
import type { SimilarEpisodeExplanation } from '../engine/similarity.js';

/**
 * The public shape of a classification. Engines hand back a Prediction and the service stores it, so this
 * stays the same whichever engine produced it. Change it only with a new API version.
 */
export interface ClassificationResponse {
  animeId: number;
  episodeId: number | null;
  episode: number;
  prediction: string;
  category: Category;
  /** 0-100. */
  confidence: number;
  decision: Decision | null;
  reasons: string[];
  similarEpisodes: Array<{
    animeId: number;
    animeTitle: string;
    episode: number;
    title: string | null;
    classification: string;
    category: Category;
    similarity: number;
    trust: TrustLevel;
    selectedBecause: string;
  }>;
  supportingRules: Array<{ ruleId: number; ruleName: string; target: string; score: number; appliedScore: number; explanation: string }>;
  contributors: Array<{
    name: string;
    /** Share of the evidence separating the winner from the runner-up, as a percentage. Negative argued against. */
    evidenceShare: number;
    strength: number;
    leans: string;
    reasons: string[];
  }>;
  evidenceTier: string | null;
  arc: unknown;
  trust: TrustLevel | null;
  origin: Origin | null;
  review: { status: ReviewStatus; history: ReviewHistoryEntry[] };
  engine: { name: string; version: string } | null;
  classificationId: number | null;
  createdAt: string | null;
}

export interface ReviewHistoryEntry {
  action: string;
  originalPrediction: string | null;
  originalConfidence: number | null;
  newClassification: string;
  reason: string | null;
  reviewer: string;
  timestamp: string;
}

function similarToResponse(similar: SimilarEpisodeExplanation[]): ClassificationResponse['similarEpisodes'] {
  return similar.map((s) => ({
    animeId: s.animeId,
    animeTitle: s.animeTitle,
    episode: s.episode,
    title: s.title,
    classification: CATEGORY_LABELS[s.classification],
    category: s.classification,
    similarity: s.similarity,
    trust: s.trust,
    selectedBecause: s.selectedBecause,
  }));
}

function rulesToResponse(rules: RuleHit[]): ClassificationResponse['supportingRules'] {
  return rules.map((r) => ({
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    target: CATEGORY_LABELS[r.targetCategory],
    score: r.scoreValue,
    appliedScore: Number(r.appliedScore.toFixed(2)),
    explanation: r.explanation,
  }));
}

function contributorsToResponse(scores: ContributorScore[]): ClassificationResponse['contributors'] {
  return scores.map((s) => ({
    name: s.name,
    evidenceShare: Math.round(s.share * 100),
    strength: s.strength,
    leans: CATEGORY_LABELS[s.topCategory],
    reasons: s.reasons,
  }));
}

/** A prediction that wasn't stored, from a preview request. */
export function predictionToResponse(animeId: number, number: number, prediction: Prediction): ClassificationResponse {
  return {
    animeId,
    episodeId: null,
    episode: number,
    prediction: CATEGORY_LABELS[prediction.category],
    category: prediction.category,
    confidence: Math.round(prediction.confidence * 100),
    decision: prediction.decision,
    reasons: prediction.reasons,
    similarEpisodes: similarToResponse(prediction.similarEpisodes),
    supportingRules: rulesToResponse(prediction.supportingRules),
    contributors: contributorsToResponse(prediction.contributors),
    evidenceTier: prediction.evidenceTier,
    arc: prediction.arc,
    trust: null,
    origin: null,
    review: { status: 'UNREVIEWED', history: [] },
    engine: prediction.engine,
    classificationId: null,
    createdAt: null,
  };
}

interface HistoryRow {
  id: number;
  category: Category;
  confidence: number;
  evidence_tier: string | null;
  decision: Decision | null;
  origin: Origin;
  trust_level: TrustLevel;
  engine_name: string | null;
  engine_version: string | null;
  reasons: string[];
  supporting_rules: RuleHit[];
  similar_episodes: SimilarEpisodeExplanation[];
  arc_context: unknown;
  created_at: Date;
}

export async function loadReviewHistory(db: Queryable, episodeId: number): Promise<ReviewHistoryEntry[]> {
  const { rows } = await db.query<{
    action: string;
    original_prediction: Category | null;
    original_confidence: number | null;
    new_classification: Category;
    reason: string | null;
    reviewer: string;
    created_at: Date;
  }>(
    `SELECT action, original_prediction, original_confidence, new_classification, reason, reviewer, created_at
     FROM review_audit_log WHERE episode_id = $1 ORDER BY id DESC`,
    [episodeId],
  );
  return rows.map((r) => ({
    action: r.action,
    originalPrediction: r.original_prediction ? CATEGORY_LABELS[r.original_prediction] : null,
    originalConfidence: r.original_confidence === null ? null : Math.round(r.original_confidence * 100),
    newClassification: CATEGORY_LABELS[r.new_classification],
    reason: r.reason,
    reviewer: r.reviewer,
    timestamp: r.created_at.toISOString(),
  }));
}

/** The full stored trace for an episode: what was decided, by what, and every review since. */
export async function loadClassification(db: Queryable, episode: EpisodeRow): Promise<ClassificationResponse | null> {
  if (!episode.current_classification_id || !episode.category) return null;
  const { rows } = await db.query<HistoryRow>('SELECT * FROM classification_history WHERE id = $1', [episode.current_classification_id]);
  const row = rows[0]!;
  const { rows: scores } = await db.query<{
    contributor: ContributorScore['name'];
    strength: number;
    share: number;
    top_category: Category;
    reasons: string[];
  }>('SELECT contributor, strength, share, top_category, reasons FROM prediction_scores WHERE classification_id = $1 ORDER BY abs(share) DESC', [row.id]);

  return {
    animeId: episode.anime_id,
    episodeId: episode.id,
    episode: episode.number,
    prediction: CATEGORY_LABELS[row.category],
    category: row.category,
    confidence: Math.round(row.confidence * 100),
    decision: row.decision,
    reasons: row.reasons,
    similarEpisodes: similarToResponse(row.similar_episodes),
    supportingRules: rulesToResponse(row.supporting_rules),
    contributors: scores.map((s) => ({
      name: s.contributor,
      evidenceShare: Math.round(s.share * 100),
      strength: s.strength,
      leans: CATEGORY_LABELS[s.top_category],
      reasons: s.reasons,
    })),
    evidenceTier: row.evidence_tier,
    arc: row.arc_context,
    trust: row.trust_level,
    origin: row.origin,
    review: { status: episode.review_status, history: await loadReviewHistory(db, episode.id) },
    engine: row.engine_name ? { name: row.engine_name, version: row.engine_version ?? '' } : null,
    classificationId: row.id,
    createdAt: row.created_at.toISOString(),
  };
}
