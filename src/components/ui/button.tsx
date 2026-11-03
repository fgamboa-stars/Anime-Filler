import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Buttons. Edged variants carry a 2px border and a hard offset shadow, and pressing one
 * moves it into its shadow. "default" is the inverted primary; keep one per view.
 * Default and large sizes meet the 44px touch target.
 */
const pressable =
  'shadow-[3px_3px_0_0_var(--hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--hard)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none motion-reduce:transform-none';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-[13px] font-bold tracking-[0.06em] uppercase transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: cn('border-2 border-edge bg-primary text-primary-foreground hover:bg-primary/88', pressable),
        secondary: cn('border-2 border-edge bg-surface-2 text-foreground hover:bg-surface-3', pressable),
        outline: cn('border-2 border-edge bg-surface text-foreground hover:bg-surface-2', pressable),
        ghost: 'border-2 border-transparent text-foreground hover:border-edge hover:bg-surface',
        link: 'px-0 normal-case tracking-normal text-foreground underline decoration-2 underline-offset-4 hover:bg-lime hover:text-lime-foreground',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3.5 text-xs',
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
