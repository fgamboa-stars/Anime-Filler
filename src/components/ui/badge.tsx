import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Small labels. Neutral by default; the coloured variants are reserved for episode
 * types and status, and always use the AA-contrast "-text" tokens on a light tint.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border-strong/40 bg-surface-2 text-muted-foreground',
        outline: 'border-border text-muted-foreground',
        solid: 'border-transparent bg-primary text-primary-foreground',
        canon: 'border-canon/50 bg-[color-mix(in_oklab,var(--canon)_10%,var(--surface))] text-canon-text',
        filler: 'border-filler/50 bg-[color-mix(in_oklab,var(--filler)_10%,var(--surface))] text-filler-text',
        mixed: 'border-mixed/55 bg-[color-mix(in_oklab,var(--mixed)_10%,var(--surface))] text-mixed-text',
        animeCanon: 'border-anime-canon/50 bg-[color-mix(in_oklab,var(--anime-canon)_10%,var(--surface))] text-anime-canon-text',
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
