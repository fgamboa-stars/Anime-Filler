import { Skeleton } from '@/components/ui/skeleton';
import { PixelIcon } from '@/components/retro/PixelIcon';

export function PageFallback() {
  return (
    <div className="container-page py-10" role="status" aria-label="Loading page">
      <p aria-hidden className="text-label mb-8 flex items-center gap-3">
        <PixelIcon name="hourglass" size={2} className="animate-pulse" />
        Loading…
      </p>
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <Skeleton className="mt-4 h-4 w-1/2 max-w-md" />
      <Skeleton className="mt-10 h-12 w-full" />
      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3]" />
        ))}
      </div>
    </div>
  );
}
