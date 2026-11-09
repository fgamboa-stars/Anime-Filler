import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { RangeTuple } from 'fuse.js';
import { Poster } from '@/components/Poster';
import { FillerAvailabilityBadge } from '@/components/FillerAvailabilityBadge';
import { Highlight } from '@/components/Highlight';
import { formatFormat, type MediaSummary } from '@/services/anilist';
import { animePath } from '@/services/datasets';
import type { CatalogEntry } from '@/types';
import { cn } from '@/utils/cn';

interface AnimeCardProps {
  id: number;
  title: string;
  media: MediaSummary | null;
  catalog: CatalogEntry | null;
  highlights?: readonly RangeTuple[];
  className?: string;
  priority?: boolean;
  /** Replaces the "Filler data available / coming soon" badge. */
  label?: ReactNode;
}

export function AnimeCard({ id, title, media, catalog, highlights = [], className, priority, label }: AnimeCardProps) {
  const facts = [
    media?.seasonYear ? String(media.seasonYear) : null,
    formatFormat(media?.format ?? null),
    media?.episodes ? `${media.episodes} eps` : catalog ? `${catalog.totalEpisodes} eps` : null,
  ].filter(Boolean);

  return (
    <article className={cn('group relative flex flex-col gap-3', className)}>
      <Poster
        src={media?.coverImage.large}
        color={media?.coverImage.color}
        title={title}
        priority={priority}
        className="shadow-hard transition-[transform,box-shadow] duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-hard-lg group-focus-within:-translate-x-0.5 group-focus-within:-translate-y-0.5 group-focus-within:shadow-hard-lg motion-reduce:transform-none"
      />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] leading-snug font-bold tracking-[-0.015em]">
          <Link to={animePath({ anilistId: id, title })} className="outline-none after:absolute after:inset-0 focus-visible:underline">
            <Highlight text={title} ranges={highlights} />
          </Link>
        </h3>
        {facts.length > 0 && <p className="text-xs text-muted-foreground">{facts.join(', ')}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {label ?? <FillerAvailabilityBadge available={!!catalog} />}
          {media?.averageScore ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3 fill-current" aria-hidden />
              <span className="tabular">{media.averageScore}%</span>
              <span className="sr-only">average score</span>
            </span>
          ) : null}
        </div>
        {catalog && (
          <p className="text-xs text-muted-foreground">
            <span className="tabular font-semibold text-filler-text">{catalog.fillerPercentage}%</span> filler across{' '}
            {catalog.totalEpisodes} episodes
          </p>
        )}
      </div>
    </article>
  );
}

export function AnimeCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="aspect-[2/3] animate-shimmer bg-surface-2" />
      <div className="h-4 w-4/5 animate-shimmer bg-surface-2" />
      <div className="h-3 w-1/2 animate-shimmer bg-surface-2" />
    </div>
  );
}
