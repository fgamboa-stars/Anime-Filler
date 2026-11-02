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
      <h2 id="arcs-heading" className="text-2xl font-bold tracking-tight">
        Story arcs
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {arcs.length} arcs in broadcast order. Arcs made only of red are anime-original — skip them without missing the story.
      </p>
      <ol className="grid gap-3 md:grid-cols-2">
        {ordered.map((arc) => {
          const eps = episodes.filter((e) => e.arcSlug === arc.slug);
          const pct = fillerPercentage(arc.counts);
          const seen = eps.filter((e) => watched.has(e.number)).length;
          const range = arc.ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`)).join(', ');
          return (
            <li key={arc.slug} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sans text-base leading-snug font-semibold">{arc.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Episodes <span className="tabular">{range}</span>, {eps.length} total
                    {seen > 0 && (
                      <>
                        , <span className="tabular">{seen}</span> watched
                      </>
                    )}
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span className={`tabular font-display text-xl font-bold ${pct === 0 ? 'text-canon' : pct === 100 ? 'text-filler' : 'text-foreground'}`}>{pct}%</span>
                  <span className="block text-[11px] text-muted-foreground">filler</span>
                </p>
              </div>
              <EpisodeStrip episodes={eps} watched={watched} size="sm" label={`${arc.name}: ${arc.counts.FILLER} filler of ${eps.length}`} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                <Link to={`${pathname}?arc=${arc.slug}`} className="hover:underline underline-offset-4">
                  View episodes
                </Link>
                {arc.counts.FILLER > 0 && arc.counts.FILLER < eps.length && (
                  <Link to={`${pathname}?arc=${arc.slug}&type=canon,mixed,anime-canon`} className="text-canon hover:underline underline-offset-4">
                    Canon only
                  </Link>
                )}
                <Link to={`${pathname}?view=watch-order&arc=${arc.slug}`} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
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
