import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { fieldClass } from './input';

/** Native select (keeps platform pickers on mobile) with consistent field styling. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn('relative', wrapperClassName)}>
      <select ref={ref} className={cn(fieldClass, 'cursor-pointer appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
