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
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
        pressed
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
ToggleChip.displayName = 'ToggleChip';
