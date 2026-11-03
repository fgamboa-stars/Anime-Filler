import type { ClassificationRule, ConditionField, RuleCondition } from '../domain/rules.js';
import type { EngineSettings } from '../domain/settings.js';
import type { AnimeMeta, Category, Distribution, EpisodeInput } from '../domain/types.js';
import { emptyDistribution } from '../domain/types.js';

export interface RuleHit {
  ruleId: number;
  ruleName: string;
  targetCategory: Category;
  scoreValue: number;
  /** scoreValue times the rule's learned skill: what this prediction actually used. */
  appliedScore: number;
  decisive: boolean;
  explanation: string;
}

export interface RuleFacts {
  anime: AnimeMeta;
  episode: EpisodeInput;
}

function fieldValue(facts: RuleFacts, field: ConditionField): string | string[] | number | null {
  const { anime, episode } = facts;
  switch (field) {
    case 'anime.format':
      return anime.format;
    case 'anime.source':
      return anime.source;
    case 'anime.status':
      return anime.status;
    case 'anime.genres':
      return anime.genres;
    case 'anime.tags':
      return anime.tags.map((t) => t.name);
    case 'anime.totalEpisodes':
      return anime.totalEpisodes;
    case 'episode.number':
      return episode.number;
    case 'episode.title':
      return episode.title;
    case 'episode.description':
      return episode.description;
    case 'episode.arc':
      return episode.arc;
    case 'episode.tags':
      return episode.tags;
  }
}

const regexCache = new Map<string, RegExp>();
function compile(pattern: string): RegExp {
  let regex = regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern, 'iu');
    regexCache.set(pattern, regex);
  }
  return regex;
}

export function matchesCondition(condition: RuleCondition, facts: RuleFacts): boolean {
  if ('all' in condition) return condition.all.every((c) => matchesCondition(c, facts));
  if ('any' in condition) return condition.any.some((c) => matchesCondition(c, facts));
  if ('not' in condition) return !matchesCondition(condition.not, facts);

  const value = fieldValue(facts, condition.field);
  if (value === null || value === undefined) return false;

  if ('in' in condition) {
    const wanted = new Set(condition.in.map((v) => v.toLowerCase()));
    const values = Array.isArray(value) ? value : [String(value)];
    return values.some((v) => wanted.has(v.toLowerCase()));
  }
  if ('matches' in condition) {
    const regex = compile(condition.matches);
    return Array.isArray(value) ? value.some((v) => regex.test(v)) : regex.test(String(value));
  }
  if (typeof value !== 'number') return false;
  return 'gte' in condition ? value >= condition.gte : value <= condition.lte;
}

export function evaluateRules(rules: ClassificationRule[], facts: RuleFacts): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !matchesCondition(rule.condition, facts)) continue;
    hits.push({
      ruleId: rule.id,
      ruleName: rule.ruleName,
      targetCategory: rule.targetCategory,
      scoreValue: rule.scoreValue,
      appliedScore: rule.scoreValue * rule.skill,
      decisive: rule.decisive,
      explanation: rule.explanation,
    });
  }
  return hits;
}

/** Rule points per category, in nats. Points are the admin's score_value scaled by the rule's learned skill. */
export function ruleLogOdds(hits: RuleHit[], settings: EngineSettings): Distribution {
  const logOdds = emptyDistribution();
  for (const hit of hits) logOdds[hit.targetCategory] += hit.appliedScore / settings.rules.pointsPerNat;
  return logOdds;
}
