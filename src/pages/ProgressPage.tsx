import { Link } from 'react-router-dom';
import { Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StateMessage } from '@/components/StateMessage';
import { ContinueWatching } from '@/features/progress/ContinueWatching';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getCatalog } from '@/services/datasets';

export default function ProgressPage() {
  useDocumentTitle('My progress');
  const first = getCatalog()[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">My progress</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Episodes you mark as watched are saved in this browser only. Nothing is uploaded, so clearing site data resets it.
      </p>
      <div className="mt-8">
        <ContinueWatching
          limit={50}
          emptyState={
            <StateMessage
              title="Nothing in progress yet"
              icon={<Tv className="size-5 text-muted-foreground" aria-hidden />}
              action={
                first && (
                  <Button asChild size="sm">
                    <Link to={`/anime/${first.slug}`}>Start {first.title}</Link>
                  </Button>
                )
              }
            >
              Tick the checkbox next to an episode to mark it watched. Your next episode will appear here.
            </StateMessage>
          }
        />
      </div>
    </div>
  );
}
