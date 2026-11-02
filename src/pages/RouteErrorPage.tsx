import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown instead of React Router's developer error screen if a page crashes. */
export default function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">This page hit a problem.</h1>
      <p className="mt-3 text-muted-foreground">
        Reload to try again. Your watch progress is saved in this browser and isn’t affected.
      </p>
      {detail && <p className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">Error: {detail}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden />
          Reload page
        </Button>
        <Button asChild variant="secondary">
          <a href="/">Go to the home page</a>
        </Button>
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Still broken? <Link to="/discover" className="text-foreground underline underline-offset-4">Browse the filler guides</Link> instead.
      </p>
    </div>
  );
}
