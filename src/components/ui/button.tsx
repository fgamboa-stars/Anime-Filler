import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Buttons. "default" is the inverted primary (black on light, white on dark) and is the
 * only filled button style; keep one per view. Default and large sizes meet the 44px touch target.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/88',
        secondary: 'bg-surface-2 text-foreground hover:bg-surface-3',
        outline: 'border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-2',
        ghost: 'text-foreground hover:bg-surface-2',
        link: 'rounded-none px-0 text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground active:scale-100',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-4 text-[13px]',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
