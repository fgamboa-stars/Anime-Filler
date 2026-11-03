import * as React from 'react';
import { cn } from '@/utils/cn';

interface ToggleChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/** Pill toggle used for filters. Announces state with aria-pressed. */
export const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, onPressedChange, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 border-2 px-3.5 text-xs font-bold tracking-[0.05em] uppercase transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
        pressed
          ? 'border-foreground bg-foreground text-background'
          : 'border-edge bg-surface text-foreground hover:bg-lime hover:text-lime-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
ToggleChip.displayName = 'ToggleChip';
