import type { ClassificationRule, TagDetector } from '../domain/rules.js';
import { DEFAULT_SETTINGS, type EngineSettings } from '../domain/settings.js';
import { SEED_RULES, SEED_TAG_DETECTORS } from '../domain/seedData.js';
import type { Category, Distribution } from '../domain/types.js';
import type { Calibration } from '../engine/calibration.js';
import type { GlobalKnowledge, TagPattern } from '../engine/evidence.js';
import { computePrior } from '../engine/learning.js';
import { tagPatternKey } from '../engine/tags.js';
import type { Queryable } from './database.js';

/** Copies seed rules, detectors and default settings into a new database. Existing rows are left alone. */
export async function seedConfiguration(db: Queryable): Promise<void> {
  for (const rule of SEED_RULES) {
    await db.query(
      `INSERT INTO classification_rules (rule_name, target_category, score_value, decisive, condition, explanation)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (rule_name) DO NOTHING`,
      [rule.ruleName, rule.targetCategory, rule.scoreValue, rule.decisive ?? false, JSON.stringify(rule.condition), rule.explanation],
    );
  }
  for (const detector of SEED_TAG_DETECTORS) {
    await db.query('INSERT INTO tag_detectors (tag, pattern) VALUES ($1, $2) ON CONFLICT (tag) DO NOTHING', [
      detector.tag,
      detector.pattern,
    ]);
  }
  await db.query('INSERT INTO engine_settings (settings) VALUES ($1::jsonb) ON CONFLICT (id) DO NOTHING', [
    JSON.stringify(DEFAULT_SETTINGS),
  ]);
}

interface RuleRow {
  id: number;
  rule_name: string;
  target_category: Category;
  score_value: number;
  enabled: boolean;
  decisive: boolean;
  condition: ClassificationRule['condition'];
  explanation: string;
  skill: number;
  last_updated: Date;
}

export function toRule(row: RuleRow): ClassificationRule {
  return {
    id: row.id,
    ruleName: row.rule_name,
    targetCategory: row.target_category,
    scoreValue: row.score_value,
    enabled: row.enabled,
    decisive: row.decisive,
    condition: row.condition,
    explanation: row.explanation,
    skill: row.skill,
    lastUpdated: row.last_updated,
  };
}

export async function loadRules(db: Queryable): Promise<ClassificationRule[]> {
  const { rows } = await db.query<RuleRow>('SELECT * FROM classification_rules ORDER BY id');
  return rows.map(toRule);
}

export async function loadDetectors(db: Queryable): Promise<TagDetector[]> {
  const { rows } = await db.query<TagDetector>('SELECT tag, pattern, enabled FROM tag_detectors ORDER BY tag');
  return rows;
}

export async function loadSettings(db: Queryable): Promise<{ settings: EngineSettings; version: number }> {
  const { rows } = await db.query<{ settings: EngineSettings; version: number }>(
    'SELECT settings, version FROM engine_settings WHERE id',
  );
  const row = rows[0];
  if (!row) throw new Error('engine_settings is empty. Run `cli migrate` first.');
  return row;
}

export async function loadCalibration(db: Queryable): Promise<Calibration | null> {
  const { rows } = await db.query<{ version: string; tiers: Calibration['tiers'] }>(
    'SELECT version, tiers FROM confidence_calibration WHERE active',
  );
  return rows[0] ?? null;
}

export async function loadTagPatterns(db: Queryable): Promise<Map<string, TagPattern>> {
  const { rows } = await db.query<{ scope: 'episode' | 'series'; tag: string; category: Category; weight: number }>(
    'SELECT scope, tag, category, weight FROM tag_patterns WHERE weight > 0',
  );
  const patterns = new Map<string, TagPattern>();
  for (const row of rows) {
    const key = tagPatternKey(row.scope, row.tag);
    const pattern = patterns.get(key) ?? { tag: row.tag, scope: row.scope, counts: {}, total: 0 };
    pattern.counts[row.category] = row.weight;
    pattern.total += row.weight;
    patterns.set(key, pattern);
  }
  return patterns;
}

export async function loadPrior(db: Queryable): Promise<Distribution> {
  const { rows } = await db.query<{ category: Category; count: number }>('SELECT category, count FROM category_counts');
  return computePrior(Object.fromEntries(rows.map((r) => [r.category, r.count])));
}

/**
 * Loads what every classification needs, once. Rules, settings and calibration change rarely. Tag patterns
 * and the prior drift slowly with each review, and a short TTL is good enough for them.
 */
export class KnowledgeCache {
  private cached: { value: GlobalKnowledge; expires: number } | null = null;

  constructor(
    private readonly db: Queryable,
    private readonly ttlMs = 30_000,
  ) {}

  invalidate(): void {
    this.cached = null;
  }

  async get(): Promise<GlobalKnowledge> {
    if (this.cached && this.cached.expires > Date.now()) return this.cached.value;
    const [rules, { settings, version: settingsVersion }, tagPatterns, prior, calibration] = await Promise.all([
      loadRules(this.db),
      loadSettings(this.db),
      loadTagPatterns(this.db),
      loadPrior(this.db),
      loadCalibration(this.db),
    ]);
    const rulesVersion = rules.reduce((latest, r) => Math.max(latest, r.lastUpdated.getTime()), 0);
    const value: GlobalKnowledge = {
      rules,
      settings,
      tagPatterns,
      prior,
      calibration,
      version: `s${settingsVersion}.r${rulesVersion}.c${calibration?.version ?? 'none'}`,
    };
    this.cached = { value, expires: Date.now() + this.ttlMs };
    return value;
  }
}
