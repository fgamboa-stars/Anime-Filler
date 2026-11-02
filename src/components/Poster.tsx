import { useState } from 'react';
import { cn } from '@/utils/cn';

interface PosterProps {
  src?: string | null;
  title: string;
  color?: string | null;
  className?: string;
  priority?: boolean;
}

/** Cover art with a fixed 2:3 frame so layout never shifts while images load. */
export function Poster({ src, title, color, className, priority = false }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div
      className={cn('relative aspect-[2/3] overflow-hidden rounded-lg bg-muted', className)}
      style={color ? { backgroundColor: `${color}33` } : undefined}
    >
      {showImage ? (
        <img
          src={src}
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
          <span className="font-display text-lg leading-tight font-semibold text-foreground/80">{title}</span>
        </div>
      )}
    </div>
  );
}
