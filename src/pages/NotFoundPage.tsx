import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SearchBox } from '@/features/search/SearchBox';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage({ message }: { message?: string }) {
  useDocumentTitle('Page not found');
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">This page isn’t in the episode guide.</h1>
      <p className="mt-3 text-muted-foreground">{message ?? 'The link may be mistyped, or the anime was moved. Search for it instead.'}</p>
      <SearchBox className="mt-8" />
      <Button asChild variant="secondary" className="mt-6">
        <Link to="/">Go to the home page</Link>
      </Button>
    </div>
  );
}
