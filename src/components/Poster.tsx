import { useState } from 'react';
import { cn } from '@/utils/cn';

interface PosterProps {
  src?: string | null;
  srcSet?: string;
  sizes?: string;
  title: string;
  color?: string | null;
  className?: string;
  priority?: boolean;
}

/** Cover art with a fixed 2:3 frame so layout never shifts while images load. */
export function Poster({ src, srcSet, sizes, title, color, className, priority = false }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div
      className={cn('relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-black/6 after:ring-inset dark:after:ring-white/8', className)}
      data-color={color ?? undefined}
    >
      {showImage ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={`${title} cover art`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...{ fetchpriority: priority ? 'high' : 'auto' }}
          width={230}
          height={345}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-end p-3">
          <span className="text-lg leading-tight font-semibold tracking-tight text-muted-foreground">{title}</span>
        </div>
      )}
    </div>
  );
}
