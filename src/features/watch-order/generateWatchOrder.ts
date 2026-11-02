import type { EpisodeRange, EpisodeType } from '@/types';
import { formatRange, toRanges } from '@/utils/dataset';

export interface WatchOrderOptions {
  includeMixed: boolean;
  includeAnimeCanon: boolean;
}

export const DEFAULT_WATCH_OPTIONS: WatchOrderOptions = { includeMixed: true, includeAnimeCanon: true };

export interface WatchOrder {
  watch: EpisodeRange[];
  skip: EpisodeRange[];
  watchCount: number;
  skipCount: number;
  watchTypes: EpisodeType[];
}

export function watchTypesFor(options: WatchOrderOptions): EpisodeType[] {
  return [
    'CANON',
    ...(options.includeMixed ? (['MIXED'] as const) : []),
    ...(options.includeAnimeCanon ? (['ANIME_CANON'] as const) : []),
  ];
}

/** Split episodes into contiguous WATCH and SKIP ranges. */
export function generateWatchOrder(
  episodes: { number: number; type: EpisodeType }[],
  options: WatchOrderOptions = DEFAULT_WATCH_OPTIONS,
): WatchOrder {
  const watchTypes = watchTypesFor(options);
  const keep = new Set<EpisodeType>(watchTypes);
  const watch: number[] = [];
  const skip: number[] = [];
  for (const ep of episodes) (keep.has(ep.type) ? watch : skip).push(ep.number);
  return { watch: toRanges(watch), skip: toRanges(skip), watchCount: watch.length, skipCount: skip.length, watchTypes };
}

export function watchOrderToText(order: WatchOrder, heading: string, url?: string): string {
  const lines = [heading, '', 'WATCH', ...order.watch.map(formatRange), '', 'SKIP', ...(order.skip.length ? order.skip.map(formatRange) : ['(nothing to skip)'])];
  lines.push('', `${order.watchCount} to watch, ${order.skipCount} to skip`);
  if (url) lines.push(`Made with Anime Filler Finder: ${url}`);
  return lines.join('\n');
}

/** Rough time saved by skipping, assuming ~23 minutes per episode without OP/ED. */
export function hoursSaved(skipCount: number, minutesPerEpisode = 23): number {
  return Math.round((skipCount * minutesPerEpisode) / 6) / 10;
}
