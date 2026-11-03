import type { RuleCondition } from './rules.js';
import type { Category } from './types.js';

export interface SeedRule {
  ruleName: string;
  targetCategory: Category;
  scoreValue: number;
  decisive?: boolean;
  condition: RuleCondition;
  explanation: string;
}

/**
 * Starting rule set, copied into `classification_rules` once and edited there afterwards. The engine holds
 * no rule values of its own. Patterns were checked against the labelled datasets: "special" alone matches
 * "Special Beam Cannon", and "so far" matches "So Close Yet So Far".
 */
export const SEED_TAG_DETECTORS: Array<{ tag: string; pattern: string }> = [
  { tag: 'recap', pattern: '\\b(recap|digest|retrospective|the story so far|looking back)\\b' },
  {
    tag: 'special-episode',
    pattern: "\\b(special episode|special report|(new year'?s?|christmas|holiday|summer) special)\\b|\\bspecial!*$",
  },
  { tag: 'beach', pattern: '\\b(beach|swimsuits?|hot springs?|onsen)\\b' },
  { tag: 'tournament', pattern: '\\b(tournament|semi-?finals?|preliminar(y|ies)|chunin exams?)\\b' },
  { tag: 'holiday', pattern: "\\b(christmas|new year'?s?|halloween|valentine'?s?)\\b" },
];

export const SEED_RULES: SeedRule[] = [
  {
    ruleName: 'Format: OVA',
    targetCategory: 'OVA',
    scoreValue: 100,
    decisive: true,
    condition: { field: 'anime.format', in: ['OVA'] },
    explanation: 'AniList lists this entry as an OVA',
  },
  {
    ruleName: 'Format: Special',
    targetCategory: 'SPECIAL',
    scoreValue: 100,
    decisive: true,
    condition: { field: 'anime.format', in: ['SPECIAL'] },
    explanation: 'AniList lists this entry as a TV special',
  },
  {
    ruleName: 'Format: Movie',
    targetCategory: 'MOVIE',
    scoreValue: 100,
    decisive: true,
    condition: { field: 'anime.format', in: ['MOVIE'] },
    explanation: 'AniList lists this entry as a movie',
  },
  {
    ruleName: 'Manga Adaptation',
    targetCategory: 'CANON',
    scoreValue: 30,
    condition: { field: 'anime.source', in: ['MANGA', 'LIGHT_NOVEL', 'WEB_NOVEL', 'NOVEL', 'VISUAL_NOVEL'] },
    explanation: 'Adapted from a manga or novel, so most episodes follow the source',
  },
  {
    // Means no source material exists, so nothing can stray from it. Not the same as an anime-original episode.
    ruleName: 'Original Work',
    targetCategory: 'CANON',
    scoreValue: 60,
    condition: { field: 'anime.source', in: ['ORIGINAL'] },
    explanation: 'Original anime with no source material to diverge from',
  },
  {
    ruleName: 'Anime Original',
    targetCategory: 'FILLER',
    scoreValue: 30,
    condition: { field: 'episode.tags', in: ['anime-original'] },
    explanation: 'Tagged as anime-original content',
  },
  {
    ruleName: 'Beach Episode',
    targetCategory: 'FILLER',
    scoreValue: 15,
    condition: { field: 'episode.tags', in: ['beach'] },
    explanation: 'Title suggests a beach or hot-spring episode',
  },
  {
    ruleName: 'Tournament Arc',
    targetCategory: 'CANON',
    scoreValue: 10,
    condition: { field: 'episode.tags', in: ['tournament'] },
    explanation: 'Title or arc points to a tournament storyline',
  },
  {
    ruleName: 'Recap',
    targetCategory: 'SPECIAL',
    scoreValue: 25,
    condition: { field: 'episode.tags', in: ['recap'] },
    explanation: 'Title suggests a recap episode',
  },
  {
    ruleName: 'Special Episode Title',
    targetCategory: 'SPECIAL',
    scoreValue: 25,
    condition: { field: 'episode.tags', in: ['special-episode'] },
    explanation: 'Title calls itself a special',
  },
  {
    ruleName: 'Original Character',
    targetCategory: 'ANIME_CANON',
    scoreValue: 20,
    condition: { field: 'episode.tags', in: ['original-character'] },
    explanation: 'Tagged as featuring an anime-original character',
  },
];
