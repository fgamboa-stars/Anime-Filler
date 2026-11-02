import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { progressStats, selectInProgress, useProgressStore } from '@/store/progressStore';

export function ContinueWatching({ limit = 4, emptyState }: { limit?: number; emptyState?: React.ReactNode }) {
  const progress = useProgressStore((s) => s.progress);
  const items = selectInProgress(progress).slice(0, limit);
  if (items.length === 0) return <>{emptyState ?? null}</>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((p) => {
        const stats = progressStats(p, p.totalEpisodes);
        return (
          <li key={p.slug}>
            <Link
              to={`/anime/${p.slug}${stats.nextEpisode ? `#ep-${stats.nextEpisode}` : ''}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-ring/60"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {stats.nextEpisode ? `Up next: episode ${stats.nextEpisode}` : 'Finished'} — <span className="tabular">{stats.watchedCount}</span> /{' '}
                  <span className="tabular">{stats.total}</span> watched
                </span>
                <Progress value={stats.percent} label={`${p.title}: ${stats.percent}% complete`} className="mt-2" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
