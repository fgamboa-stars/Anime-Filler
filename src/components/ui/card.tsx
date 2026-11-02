import * as React from 'react';
import { cn } from '@/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation for cards that are wholly clickable. */
  interactive?: boolean;
}

/** Surface container: 24px radius, hairline border, soft elevation. */
export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'surface-card text-foreground',
        interactive && 'transition-[box-shadow,border-color,transform] duration-200 hover:border-border-strong/60 hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-heading', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
