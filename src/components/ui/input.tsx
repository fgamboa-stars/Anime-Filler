import * as React from 'react';
import { cn } from '@/utils/cn';

/** Shared field styling: 44px tall, 3:1 border, visible focus ring. */
export const fieldClass =
  'h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-subtle-foreground hover:border-foreground/60 focus-visible:border-foreground focus-visible:ring-4 focus-visible:ring-foreground/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn(fieldClass, className)} {...props} />
));
Input.displayName = 'Input';

export { Input };
