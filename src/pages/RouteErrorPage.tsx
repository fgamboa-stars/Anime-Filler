import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown instead of React Router's developer error screen if a page crashes. */
export default function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : null;

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="container-page max-w-2xl py-20 sm:py-28">
      <h1 className="text-title text-balance">This page hit a problem.</h1>
      <p className="text-lead mt-4">Reload to try again. Your watch progress is saved in this browser and isn’t affected.</p>
      {detail && (
        <p className="mt-6 border-2 border-edge bg-surface-2 px-4 py-3 font-mono text-[13px] text-muted-foreground">Error: {detail}</p>
      )}
      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden />
          Reload page
        </Button>
        <Button asChild variant="outline">
          <a href="/">Go to the home page</a>
        </Button>
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Still broken?{' '}
        <Link to="/discover" className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
          Browse the filler guides
        </Link>{' '}
        instead.
      </p>
    </div>
  );
}
