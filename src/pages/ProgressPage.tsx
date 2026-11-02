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
    <div className="container-page max-w-4xl py-12 sm:py-16">
      <h1 className="text-title">My progress</h1>
      <p className="text-lead mt-3 max-w-prose">
        Episodes you mark as watched are saved in this browser only. Nothing is uploaded, so clearing site data resets it.
      </p>
      <div className="mt-10">
        <ContinueWatching
          limit={50}
          emptyState={
            <StateMessage
              title="Nothing in progress yet"
              icon={<Tv className="text-muted-foreground" />}
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
