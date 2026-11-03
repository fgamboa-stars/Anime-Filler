import { createHash } from 'node:crypto';
import { getAnime } from './catalog.js';
import type { Queryable } from '../db/database.js';
import { loadRules, loadPrior, loadSettings } from '../db/knowledge.js';
import type { EngineSettings } from '../domain/settings.js';
import type { AnimeMeta, Category, EpisodeInput, LabeledEpisode, ReviewStatus, TrustLevel } from '../domain/types.js';
import { detectRuns } from '../engine/arc.js';
import { computePrior, emptyRuleCounts, IMPORT_VOCABULARY, learnRuleCounts, ruleSkill, type LearningSeries, type RuleOutcomeCounts } from '../engine/learning.js';
import { matchesCondition } from '../engine/rules.js';
import { computeSeriesProfile } from '../engine/series.js';
import { buildTagPatterns, seriesTagKeys } from '../engine/tags.js';

export interface ReviewedEpisode {
  anime: AnimeMeta;
  input: EpisodeInput;
  /** Label and trust before this review. Null when the episode had no label yet. */
  before: { category: Category; trust: TrustLevel } | null;
  after: { category: Category; trust: TrustLevel };
}

export const NO_TRUSTED_EVIDENCE = 'none';

function trustedEvidenceHash(rows: SeriesEpisodeRow[]): string {
  const trusted = rows.filter((r) => r.trust_level !== 'LOW').map((r) => [r.number, r.category, r.trust_level]);
  if (trusted.length === 0) return NO_TRUSTED_EVIDENCE;
  return createHash('sha256').update(JSON.stringify(trusted)).digest('hex').slice(0, 16);
}

interface SeriesEpisodeRow {
  number: number;
  title: string | null;
  arc_name: string | null;
  category: Category;
  trust_level: TrustLevel;
  review_status: ReviewStatus;
  tags: string[];
}

async function loadSeriesEpisodes(db: Queryable, animeId: number): Promise<SeriesEpisodeRow[]> {
  const { rows } = await db.query<SeriesEpisodeRow>(
    `SELECT e.number, e.title, e.arc_name, e.category, e.trust_level, e.review_status,
            COALESCE(array_agg(t.tag) FILTER (WHERE t.tag IS NOT NULL), '{}') AS tags
     FROM episodes e LEFT JOIN episode_tags t ON t.episode_id = e.id
     WHERE e.anime_id = $1 AND e.category IS NOT NULL
     GROUP BY e.id ORDER BY e.number`,
    [animeId],
  );
  return rows;
}

/**
 * Keeps everything learned from labels in step with the labels. Every update path has a matching rebuild,
 * and a test asserts they agree, so derived tables can always be regenerated from the source of truth.
 */
export class LearningService {
  /** Recomputes this series' profile, detected arcs and accuracy. */
  async refreshSeries(db: Queryable, animeId: number): Promise<void> {
    const { settings } = await loadSettings(db);
    await this.writeSeries(db, animeId, settings, await loadSeriesEpisodes(db, animeId));
  }

  private async writeSeries(db: Queryable, animeId: number, settings: EngineSettings, rows: SeriesEpisodeRow[]): Promise<void> {
    const labeled: LabeledEpisode[] = rows.map((r) => ({
      animeId,
      number: r.number,
      title: r.title,
      arc: r.arc_name,
      category: r.category,
      trust: r.trust_level,
      reviewStatus: r.review_status,
    }));

    const profile = computeSeriesProfile(animeId, labeled, settings);
    const runs = detectRuns(labeled, settings);

    const tagCounts = new Map<string, number>();
    for (const row of rows) for (const tag of row.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    const commonTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const byKind = new Map<string, { runs: number; episodes: number }>();
    for (const run of runs) {
      const entry = byKind.get(run.kind) ?? { runs: 0, episodes: 0 };
      entry.runs += 1;
      entry.episodes += run.episodeCount;
      byKind.set(run.kind, entry);
    }
    const arcStructure = Object.fromEntries(
      [...byKind.entries()].map(([kind, e]) => [kind, { runs: e.runs, averageLength: Number((e.episodes / e.runs).toFixed(1)) }]),
    );

    // Judged on each episode's first engine prediction against the label it has now, so a later correction counts.
    const { rows: accuracy } = await db.query<{ reviewed: number; correct: number }>(
      `SELECT count(*)::int AS reviewed,
              count(*) FILTER (WHERE a.original_prediction = e.category)::int AS correct
       FROM review_audit_log a JOIN episodes e ON e.id = a.episode_id
       WHERE e.anime_id = $1 AND a.original_origin = 'engine'`,
      [animeId],
    );
    const { reviewed, correct } = accuracy[0]!;

    await db.query(
      `INSERT INTO series_profiles (anime_id, canon_percentage, filler_percentage, distribution, labeled_count, effective_count,
                                    common_tags, arc_structure, reviewed_predictions, correct_predictions, historical_accuracy, evidence_hash)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
       ON CONFLICT (anime_id) DO UPDATE SET
         canon_percentage = EXCLUDED.canon_percentage, filler_percentage = EXCLUDED.filler_percentage,
         distribution = EXCLUDED.distribution, labeled_count = EXCLUDED.labeled_count, effective_count = EXCLUDED.effective_count,
         common_tags = EXCLUDED.common_tags, arc_structure = EXCLUDED.arc_structure,
         reviewed_predictions = EXCLUDED.reviewed_predictions, correct_predictions = EXCLUDED.correct_predictions,
         historical_accuracy = EXCLUDED.historical_accuracy, evidence_hash = EXCLUDED.evidence_hash, updated_at = now()`,
      [
        animeId,
        profile.distribution.CANON * 100,
        profile.distribution.FILLER * 100,
        JSON.stringify(profile.distribution),
        profile.labeledCount,
        profile.effectiveCount,
        JSON.stringify(commonTags),
        JSON.stringify(arcStructure),
        reviewed,
        correct,
        reviewed > 0 ? correct / reviewed : null,
        trustedEvidenceHash(rows),
      ],
    );

    await db.query('DELETE FROM arc_profiles WHERE anime_id = $1', [animeId]);
    for (const run of runs) {
      await db.query(
        `INSERT INTO arc_profiles (anime_id, start_episode, end_episode, category, kind, confidence, episode_count, name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [animeId, run.startEpisode, run.endEpisode, run.category, run.kind, run.confidence, run.episodeCount, run.name],
      );
    }
  }

  /** Applied inside the review transaction. Reversing the old label first means a re-review never double counts. */
  async applyReview(db: Queryable, review: ReviewedEpisode): Promise<void> {
    const { settings } = await loadSettings(db);
    const { anime, input, before, after } = review;
    const counted = before && before.trust !== 'LOW' ? before : null;

    const adjustTag = async (scope: 'episode' | 'series', tag: string) => {
      const add = async (category: Category, amount: number) => {
        await db.query(
          `INSERT INTO tag_patterns (scope, tag, category, weight) VALUES ($1,$2,$3,$4)
           ON CONFLICT (scope, tag, category) DO UPDATE SET weight = tag_patterns.weight + EXCLUDED.weight`,
          [scope, tag, category, amount],
        );
      };
      if (counted) await add(counted.category, -settings.trustWeights[counted.trust]);
      await add(after.category, settings.trustWeights[after.trust]);
    };
    for (const tag of input.tags) await adjustTag('episode', tag);
    for (const key of seriesTagKeys(anime)) await adjustTag('series', key);

    const bumpCount = async (category: Category, amount: number) => {
      await db.query(
        `INSERT INTO category_counts (category, count) VALUES ($1, $2)
         ON CONFLICT (category) DO UPDATE SET count = category_counts.count + EXCLUDED.count`,
        [category, amount],
      );
    };
    if (counted) await bumpCount(counted.category, -1);
    await bumpCount(after.category, 1);

    await this.adjustRules(db, review, counted);
    await this.refreshSeries(db, anime.id);
  }

  private async adjustRules(db: Queryable, review: ReviewedEpisode, counted: { category: Category; trust: TrustLevel } | null): Promise<void> {
    // One after the other: inside a transaction these share a single connection.
    const rules = await loadRules(db);
    const prior = await loadPrior(db);
    for (const rule of rules) {
      if (rule.decisive || !matchesCondition(rule.condition, { anime: review.anime, episode: review.input })) continue;

      const { rows } = await db.query<RuleOutcomeCounts & { high_fires: number; high_correct: number; medium_fires: number; medium_correct: number }>(
        'SELECT high_fires, high_correct, medium_fires, medium_correct FROM classification_rules WHERE id = $1',
        [rule.id],
      );
      const row = rows[0]!;
      const counts: RuleOutcomeCounts = {
        highFires: row.high_fires,
        highCorrect: row.high_correct,
        mediumFires: row.medium_fires,
        mediumCorrect: row.medium_correct,
      };

      if (counted?.trust === 'HIGH') {
        counts.highFires -= 1;
        if (counted.category === rule.targetCategory) counts.highCorrect -= 1;
      } else if (counted?.trust === 'MEDIUM' && IMPORT_VOCABULARY.has(rule.targetCategory)) {
        counts.mediumFires -= 1;
        if (counted.category === rule.targetCategory) counts.mediumCorrect -= 1;
      }
      counts.highFires += 1;
      if (review.after.category === rule.targetCategory) counts.highCorrect += 1;

      await this.writeRuleCounts(db, rule.id, counts, prior[rule.targetCategory]);
    }
  }

  private async writeRuleCounts(db: Queryable, ruleId: number, counts: RuleOutcomeCounts, prior: number): Promise<void> {
    // last_updated stays put: it records admin edits and is part of the cache key.
    await db.query(
      `UPDATE classification_rules SET high_fires = $2, high_correct = $3, medium_fires = $4, medium_correct = $5, skill = $6
       WHERE id = $1`,
      [ruleId, counts.highFires, counts.highCorrect, counts.mediumFires, counts.mediumCorrect, ruleSkill(counts, prior)],
    );
  }

  /** Regenerates all learned tables from episodes and reviews. For after a bulk import, or to repair drift. */
  async rebuildAll(db: Queryable): Promise<{ series: number; episodes: number }> {
    const { settings } = await loadSettings(db);
    const rules = await loadRules(db);
    const { rows: animeRows } = await db.query<{ id: number }>('SELECT id FROM anime ORDER BY id');

    const learning: LearningSeries[] = [];
    const counts: Partial<Record<Category, number>> = {};
    let episodes = 0;

    for (const { id } of animeRows) {
      const anime = (await getAnime(db, id))!;
      const rows = await loadSeriesEpisodes(db, id);
      await this.writeSeries(db, id, settings, rows);
      episodes += rows.length;
      learning.push({
        anime,
        episodes: rows.map((r) => ({
          animeId: id,
          number: r.number,
          title: r.title,
          description: null,
          arc: r.arc_name,
          tags: r.tags,
          category: r.category,
          trust: r.trust_level,
        })),
      });
      for (const r of rows) if (r.trust_level !== 'LOW') counts[r.category] = (counts[r.category] ?? 0) + 1;
    }

    await db.query('DELETE FROM category_counts');
    for (const [category, count] of Object.entries(counts)) {
      await db.query('INSERT INTO category_counts (category, count) VALUES ($1, $2)', [category, count]);
    }

    await db.query('DELETE FROM tag_patterns');
    for (const pattern of buildTagPatterns(learning, settings).values()) {
      for (const [category, weight] of Object.entries(pattern.counts)) {
        await db.query('INSERT INTO tag_patterns (scope, tag, category, weight) VALUES ($1,$2,$3,$4)', [pattern.scope, pattern.tag, category, weight]);
      }
    }

    const prior = computePrior(counts);
    const ruleCounts = learnRuleCounts(rules, learning);
    for (const rule of rules) await this.writeRuleCounts(db, rule.id, ruleCounts.get(rule.id) ?? emptyRuleCounts(), prior[rule.targetCategory]);

    return { series: animeRows.length, episodes };
  }
}
