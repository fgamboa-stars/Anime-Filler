import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SearchBox } from '@/features/search/SearchBox';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage({ message }: { message?: string }) {
  useDocumentTitle('Page not found');
  return (
    <div className="container-page max-w-2xl py-20 sm:py-28">
      <p className="tabular text-sm font-medium text-subtle-foreground">404</p>
      <h1 className="text-title mt-3 text-balance">This page isn’t in the episode guide.</h1>
      <p className="text-lead mt-4">{message ?? 'The link may be mistyped, or the anime was moved. Search for it instead.'}</p>
      <SearchBox className="mt-10" />
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Go to the home page</Link>
      </Button>
    </div>
  );
}
