import { Link, useLocation } from 'react-router-dom';
import { EpisodeStrip } from '@/components/EpisodeStrip';
import type { Arc, Episode } from '@/types';
import { fillerPercentage } from '@/utils/dataset';

interface ArcListProps {
  arcs: Arc[];
  episodes: Episode[];
  watched: ReadonlySet<number>;
}

export function ArcList({ arcs, episodes, watched }: ArcListProps) {
  const { pathname } = useLocation();
  const ordered = [...arcs].sort((a, b) => a.ranges[0].start - b.ranges[0].start);

  return (
    <section aria-labelledby="arcs-heading">
      <h2 id="arcs-heading" className="text-heading">
        Story arcs
      </h2>
      <p className="mt-1.5 mb-6 max-w-prose text-muted-foreground">
        {arcs.length} arcs in broadcast order. Arcs made only of red are anime-original — skip them without missing the story.
      </p>
      <ol className="grid gap-4 md:grid-cols-2">
        {ordered.map((arc) => {
          const eps = episodes.filter((e) => e.arcSlug === arc.slug);
          const pct = fillerPercentage(arc.counts);
          const seen = eps.filter((e) => watched.has(e.number)).length;
          const range = arc.ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`)).join(', ');
          return (
            <li key={arc.slug} className="surface-card flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base leading-snug font-semibold tracking-[-0.01em]">{arc.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Episodes <span className="tabular">{range}</span>, {eps.length} total
                    {seen > 0 && (
                      <>
                        , <span className="tabular">{seen}</span> watched
                      </>
                    )}
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span
                    className={`tabular text-xl font-semibold tracking-tight ${pct === 0 ? 'text-canon-text' : pct === 100 ? 'text-filler-text' : 'text-foreground'}`}
                  >
                    {pct}%
                  </span>
                  <span className="block text-[11px] text-muted-foreground">filler</span>
                </p>
              </div>
              <EpisodeStrip
                episodes={eps}
                watched={watched}
                size="sm"
                label={`${arc.name}: ${arc.counts.FILLER} filler of ${eps.length}`}
              />
              <div className="-mx-2 -mb-1 flex flex-wrap text-sm font-medium">
                <Link
                  to={`${pathname}?arc=${arc.slug}`}
                  className="inline-flex h-9 items-center rounded-full px-2 underline-offset-4 hover:underline"
                >
                  View episodes
                </Link>
                {arc.counts.FILLER > 0 && arc.counts.FILLER < eps.length && (
                  <Link
                    to={`${pathname}?arc=${arc.slug}&type=canon,mixed,anime-canon`}
                    className="inline-flex h-9 items-center rounded-full px-2 text-canon-text underline-offset-4 hover:underline"
                  >
                    Canon only
                  </Link>
                )}
                <Link
                  to={`${pathname}?view=watch-order&arc=${arc.slug}`}
                  className="inline-flex h-9 items-center rounded-full px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Arc watch order
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
