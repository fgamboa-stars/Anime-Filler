import type { Queryable } from '../db/database.js';

export interface AccuracyRow {
  reviewed: number;
  correct: number;
  accuracy: number | null;
}

export interface MonthlyStats {
  month: string;
  predictions: Array<{ decision: string | null; origin: string; count: number }>;
  reviews: { total: number; approvals: number; overrides: number };
  /** Engine predictions a person then judged. Auto-approved episodes count only if someone looked. */
  predictionAccuracy: AccuracyRow;
  byDecision: Array<{ decision: string } & AccuracyRow>;
  contributorAccuracy: Array<{ contributor: string } & AccuracyRow>;
  ruleAccuracy: Array<{ ruleId: number; ruleName: string } & AccuracyRow>;
  seriesAccuracy: Array<{ animeId: number; title: string } & AccuracyRow>;
  corrections: Array<{ reviewer: string; reviews: number; overrides: number }>;
  commonCorrections: Array<{ from: string; to: string; count: number }>;
}

function accuracy<T extends { reviewed: number; correct: number }>(row: T): T & { accuracy: number | null } {
  return { ...row, accuracy: row.reviewed > 0 ? row.correct / row.reviewed : null };
}

/**
 * Computed from the append-only logs on request. A past month can't change, so there's no snapshot table to
 * keep in step. Grades the prediction a person first saw, against what that person decided.
 */
export async function monthlyStats(db: Queryable, month: string): Promise<MonthlyStats> {
  const start = `${month}-01`;
  const range = [start];
  const inMonth = (column: string) => `${column} >= $1::date AND ${column} < ($1::date + interval '1 month')`;
  const judged = `a.original_origin = 'engine' AND ${inMonth('a.created_at')}`;
  const accuracyColumns = (match: string) =>
    `count(*)::int AS reviewed, count(*) FILTER (WHERE ${match})::int AS correct`;

  const [predictions, reviews, overall, byDecision, contributors, rules, series, corrections, common] = await Promise.all([
    db.query<{ decision: string | null; origin: string; count: number }>(
      `SELECT decision, origin, count(*)::int AS count FROM classification_history
       WHERE ${inMonth('created_at')} GROUP BY decision, origin ORDER BY origin, decision`,
      range,
    ),
    db.query<{ total: number; approvals: number; overrides: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE action = 'APPROVE')::int AS approvals,
              count(*) FILTER (WHERE action = 'OVERRIDE')::int AS overrides
       FROM review_audit_log WHERE ${inMonth('created_at')}`,
      range,
    ),
    db.query<{ reviewed: number; correct: number }>(
      `SELECT ${accuracyColumns('a.original_prediction = a.new_classification')} FROM review_audit_log a WHERE ${judged}`,
      range,
    ),
    db.query<{ decision: string; reviewed: number; correct: number }>(
      `SELECT h.decision, ${accuracyColumns('a.original_prediction = a.new_classification')}
       FROM review_audit_log a JOIN classification_history h ON h.id = a.original_classification_id
       WHERE ${judged} GROUP BY h.decision ORDER BY h.decision`,
      range,
    ),
    db.query<{ contributor: string; reviewed: number; correct: number }>(
      `SELECT s.contributor, ${accuracyColumns('s.top_category = a.new_classification')}
       FROM review_audit_log a JOIN prediction_scores s ON s.classification_id = a.original_classification_id
       WHERE ${judged} AND s.strength > 0.05 GROUP BY s.contributor ORDER BY s.contributor`,
      range,
    ),
    db.query<{ rule_id: number; rule_name: string; reviewed: number; correct: number }>(
      `SELECT r.id AS rule_id, r.rule_name, ${accuracyColumns('h.target_category = a.new_classification')}
       FROM review_audit_log a
       JOIN classification_rule_hits h ON h.classification_id = a.original_classification_id
       JOIN classification_rules r ON r.id = h.rule_id
       WHERE ${judged} GROUP BY r.id, r.rule_name ORDER BY reviewed DESC, r.id`,
      range,
    ),
    db.query<{ anime_id: number; title: string; reviewed: number; correct: number }>(
      `SELECT an.id AS anime_id, an.title, ${accuracyColumns('a.original_prediction = a.new_classification')}
       FROM review_audit_log a JOIN episodes e ON e.id = a.episode_id JOIN anime an ON an.id = e.anime_id
       WHERE ${judged} GROUP BY an.id, an.title ORDER BY reviewed DESC, an.id`,
      range,
    ),
    db.query<{ reviewer: string; reviews: number; overrides: number }>(
      `SELECT reviewer, count(*)::int AS reviews, count(*) FILTER (WHERE action = 'OVERRIDE')::int AS overrides
       FROM review_audit_log WHERE ${inMonth('created_at')} GROUP BY reviewer ORDER BY reviews DESC, reviewer`,
      range,
    ),
    db.query<{ from: string; to: string; count: number }>(
      `SELECT a.original_prediction AS "from", a.new_classification AS "to", count(*)::int AS count
       FROM review_audit_log a WHERE ${judged} AND a.action = 'OVERRIDE'
       GROUP BY 1, 2 ORDER BY count DESC, 1, 2`,
      range,
    ),
  ]);

  return {
    month,
    predictions: predictions.rows,
    reviews: reviews.rows[0]!,
    predictionAccuracy: accuracy(overall.rows[0]!),
    byDecision: byDecision.rows.map(accuracy),
    contributorAccuracy: contributors.rows.map(accuracy),
    ruleAccuracy: rules.rows.map((r) => accuracy({ ruleId: r.rule_id, ruleName: r.rule_name, reviewed: r.reviewed, correct: r.correct })),
    seriesAccuracy: series.rows.map((r) => accuracy({ animeId: r.anime_id, title: r.title, reviewed: r.reviewed, correct: r.correct })),
    corrections: corrections.rows,
    commonCorrections: common.rows,
  };
}
