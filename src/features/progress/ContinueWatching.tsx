import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { progressStats, selectInProgress, useProgressStore } from '@/store/progressStore';

export function ContinueWatching({ limit = 4, emptyState }: { limit?: number; emptyState?: React.ReactNode }) {
  const progress = useProgressStore((s) => s.progress);
  const items = selectInProgress(progress).slice(0, limit);
  if (items.length === 0) return <>{emptyState ?? null}</>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((p) => {
        const stats = progressStats(p, p.totalEpisodes);
        return (
          <li key={p.slug}>
            <Link
              to={`/anime/${p.slug}${stats.nextEpisode ? `#ep-${stats.nextEpisode}` : ''}`}
              className="surface-card group flex items-center gap-4 p-5 transition-[box-shadow,border-color] duration-200 hover:border-border-strong/60 hover:shadow-md"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105 motion-reduce:transform-none">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold tracking-[-0.01em]">{p.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {stats.nextEpisode ? `Up next: episode ${stats.nextEpisode}` : 'Finished'} —{' '}
                  <span className="tabular">{stats.watchedCount}</span> / <span className="tabular">{stats.total}</span> watched
                </span>
                <Progress value={stats.percent} label={`${p.title}: ${stats.percent}% complete`} className="mt-3" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
