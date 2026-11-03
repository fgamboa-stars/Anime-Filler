import type { EngineSettings } from '../domain/settings.js';
import type { AnimeMeta, Category, Distribution, EpisodeInput, LabeledEpisode, TrustLevel } from '../domain/types.js';
import { CATEGORIES, CATEGORY_LABELS, emptyDistribution, normalize, topCategory } from '../domain/types.js';
import { saturate, type ContributorResult } from './contributor.js';
import type { TagPattern } from './evidence.js';

/**
 * Series-level features: AniList's own tags and genres, plus coarse shape features. AniList tags describe
 * the whole show, so they can only say what kind of show tends to have filler, not which episode is filler.
 */
export function seriesTagKeys(anime: AnimeMeta): string[] {
  const keys = anime.tags.filter((t) => t.rank >= 60).map((t) => `tag:${t.name}`);
  for (const genre of anime.genres) keys.push(`genre:${genre}`);
  if (anime.source) keys.push(`source:${anime.source}`);
  if (anime.format) keys.push(`format:${anime.format}`);
  if (anime.seasonYear) keys.push(`era:${Math.floor(anime.seasonYear / 10) * 10}s`);
  const total = anime.totalEpisodes;
  if (total) {
    keys.push(`length:${total <= 13 ? 'cour' : total <= 26 ? 'two-cour' : total <= 60 ? 'mid' : total <= 150 ? 'long' : 'very-long'}`);
  }
  return keys;
}

export function tagPatternKey(scope: 'episode' | 'series', tag: string): string {
  return `${scope}|${tag}`;
}

export interface TagCountInput {
  anime: AnimeMeta;
  episodes: Array<Pick<LabeledEpisode, 'category' | 'trust'> & { tags: string[] }>;
}

/** Pure, so the backtest and the database rebuild share it. LOW trust never contributes. */
export function buildTagPatterns(series: TagCountInput[], settings: EngineSettings): Map<string, TagPattern> {
  const patterns = new Map<string, TagPattern>();
  const bump = (scope: 'episode' | 'series', tag: string, category: Category, trust: TrustLevel) => {
    if (trust === 'LOW') return;
    const key = tagPatternKey(scope, tag);
    const pattern = patterns.get(key) ?? { tag, scope, counts: {}, total: 0 };
    const weight = settings.trustWeights[trust];
    pattern.counts[category] = (pattern.counts[category] ?? 0) + weight;
    pattern.total += weight;
    patterns.set(key, pattern);
  };

  for (const { anime, episodes } of series) {
    const seriesKeys = seriesTagKeys(anime);
    for (const e of episodes) {
      for (const tag of e.tags) bump('episode', tag, e.category, e.trust);
      for (const key of seriesKeys) bump('series', key, e.category, e.trust);
    }
  }
  return patterns;
}

export function tagContributor(
  anime: AnimeMeta,
  episode: EpisodeInput,
  patterns: Map<string, TagPattern>,
  prior: Distribution,
  settings: EngineSettings,
): ContributorResult {
  const { minSupport, smoothing, episodeTagScale, seriesTagScale, saturation } = settings.tags;

  const lifts = (pattern: TagPattern): Distribution => {
    const lift = emptyDistribution();
    for (const c of CATEGORIES) {
      const p = ((pattern.counts[c] ?? 0) + smoothing * prior[c]) / (pattern.total + smoothing);
      lift[c] = prior[c] > 0 ? Math.log(Math.max(p, 1e-6) / prior[c]) : 0;
    }
    return lift;
  };

  const logScores = emptyDistribution();
  let support = 0;
  const notable: Array<{ tag: string; category: Category; lift: number }> = [];

  const episodePatterns = episode.tags
    .map((tag) => patterns.get(tagPatternKey('episode', tag)))
    .filter((p): p is TagPattern => !!p && p.total >= minSupport);
  for (const pattern of episodePatterns) {
    const lift = lifts(pattern);
    for (const c of CATEGORIES) logScores[c] += lift[c] * episodeTagScale;
    support += pattern.total;
    const top = topCategory(lift);
    notable.push({ tag: pattern.tag, category: top, lift: lift[top] });
  }

  // Series tags are heavily correlated, so they get one averaged vote, not one vote each.
  const seriesPatterns = seriesTagKeys(anime)
    .map((key) => patterns.get(tagPatternKey('series', key)))
    .filter((p): p is TagPattern => !!p && p.total >= minSupport);
  for (const pattern of seriesPatterns) {
    const lift = lifts(pattern);
    for (const c of CATEGORIES) logScores[c] += (lift[c] / seriesPatterns.length) * seriesTagScale;
    support += pattern.total / seriesPatterns.length;
    const top = topCategory(lift);
    notable.push({ tag: pattern.tag, category: top, lift: lift[top] / seriesPatterns.length });
  }

  const distribution = emptyDistribution();
  for (const c of CATEGORIES) distribution[c] = prior[c] > 0 ? prior[c] * Math.exp(logScores[c]) : 0;
  normalize(distribution);

  // Only tags that lean the same way as this layer's overall opinion, or the explanation would contradict itself.
  const overall = topCategory(distribution);
  const reasons = notable
    .filter((n) => n.lift > 0.05 && n.category === overall)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 2)
    .map((n) => `Tag pattern "${n.tag}" leans ${CATEGORY_LABELS[n.category]}`);

  return { name: 'tags', distribution, strength: saturate(support, saturation), reasons };
}
