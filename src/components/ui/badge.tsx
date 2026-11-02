import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Small labels. Neutral by default; the coloured variants are reserved for episode
 * types and status, and always use the AA-contrast "-text" tokens on a light tint.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-muted-foreground',
        outline: 'border-border text-muted-foreground',
        solid: 'border-transparent bg-primary text-primary-foreground',
        canon: 'border-canon/25 bg-canon/10 text-canon-text',
        filler: 'border-filler/25 bg-filler/10 text-filler-text',
        mixed: 'border-mixed/30 bg-mixed/10 text-mixed-text',
        animeCanon: 'border-anime-canon/25 bg-anime-canon/10 text-anime-canon-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
