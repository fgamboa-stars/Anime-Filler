import { z } from 'zod';
import type { Category } from './types.js';
import { CATEGORIES } from './types.js';

export const CONDITION_FIELDS = [
  'anime.format',
  'anime.source',
  'anime.status',
  'anime.genres',
  'anime.tags',
  'anime.totalEpisodes',
  'episode.number',
  'episode.title',
  'episode.description',
  'episode.arc',
  'episode.tags',
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export type RuleCondition =
  | { all: RuleCondition[] }
  | { any: RuleCondition[] }
  | { not: RuleCondition }
  | { field: ConditionField; in: string[] }
  | { field: ConditionField; matches: string }
  | { field: ConditionField; gte: number }
  | { field: ConditionField; lte: number };

const field = z.enum(CONDITION_FIELDS);
/** Rejected at the API boundary: an invalid pattern would otherwise fail on every classification. */
const pattern = z
  .string()
  .max(300)
  .refine((source) => {
    try {
      new RegExp(source, 'iu');
      return true;
    } catch {
      return false;
    }
  }, 'not a valid regular expression');

export const ruleConditionSchema: z.ZodType<RuleCondition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ruleConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ruleConditionSchema).min(1) }).strict(),
    z.object({ not: ruleConditionSchema }).strict(),
    z.object({ field, in: z.array(z.string()).min(1) }).strict(),
    z.object({ field, matches: pattern }).strict(),
    z.object({ field, gte: z.number() }).strict(),
    z.object({ field, lte: z.number() }).strict(),
  ]),
);

export const categorySchema = z.enum(CATEGORIES);

export interface ClassificationRule {
  id: number;
  ruleName: string;
  targetCategory: Category;
  scoreValue: number;
  enabled: boolean;
  /** A fact rather than a signal, e.g. AniList says the format is MOVIE. Skips scoring when it fires. */
  decisive: boolean;
  condition: RuleCondition;
  /** Human-readable reason shown when the rule fires. */
  explanation: string;
  /**
   * Learned from outcomes, 0-1: how much better than the base rate the rule's target turned out to be. It
   * multiplies scoreValue, which stays exactly as the admin set it. A rule that fires on nearly everything
   * and is right only as often as the base rate earns about 0, however large its score.
   */
  skill: number;
  lastUpdated: Date;
}

export interface TagDetector {
  tag: string;
  pattern: string;
  enabled: boolean;
}
