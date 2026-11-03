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
              className="tile group flex items-center gap-4 p-5"
            >
              <span className="flex size-11 shrink-0 items-center justify-center border-2 border-edge bg-primary text-primary-foreground dark:border-primary">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold tracking-[-0.025em]">{p.title}</span>
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
