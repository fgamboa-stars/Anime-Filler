import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { fieldClass } from './input';

/** Native select (keeps platform pickers on mobile) with consistent field styling. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn('relative', wrapperClassName)}>
      <select ref={ref} className={cn(fieldClass, 'cursor-pointer appearance-none pr-12', className)} {...props}>
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-[2px] right-[2px] flex w-9 items-center justify-center bg-primary text-primary-foreground"
      >
        <ChevronDown className="size-4" strokeWidth={3} />
      </span>
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
