import type { EpisodeTypeCounts } from '@/types';
import type { FranchiseGroup } from '@/utils/franchise';

/**
 * Every episode is filler: the anime tells its own story instead of following a source
 * (Kirby, Excel Saga, Dragon Ball GT). AnimeFillerList labels such shows 100% filler, which says "not from
 * the source", not "skippable", so they're kept out of the "Most filler" ranking.
 */
export function isAnimeOriginal(counts: EpisodeTypeCounts): boolean {
  const total = counts.CANON + counts.MIXED + counts.ANIME_CANON + counts.FILLER;
  return total > 0 && counts.FILLER === total;
}

/** Series where skipping saves the most time. Anime-original series are left out. */
export function rankMostFiller(groups: FranchiseGroup[], limit = 8): FranchiseGroup[] {
  return groups
    .filter((g) => g.counts.FILLER > 0 && !isAnimeOriginal(g.counts))
    .sort((a, b) => b.fillerPercentage - a.fillerPercentage || b.totalEpisodes - a.totalEpisodes)
    .slice(0, limit);
}

/** Series with some filler, closest to the source first. Filler-free series have their own "No filler" list;
 * anime-original series are left out as in rankMostFiller. */
export function rankLeastFiller(groups: FranchiseGroup[], limit = 8): FranchiseGroup[] {
  return groups
    .filter((g) => g.counts.FILLER > 0 && !isAnimeOriginal(g.counts))
    .sort((a, b) => a.fillerPercentage - b.fillerPercentage || b.totalEpisodes - a.totalEpisodes)
    .slice(0, limit);
}
