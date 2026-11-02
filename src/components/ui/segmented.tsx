import { cn } from '@/utils/cn';

interface SegmentedProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Pill-shaped view switcher. Rendered as a nav of buttons with aria-current, matching
 * the previous tab semantics (each view is also reachable by URL).
 */
export function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <nav aria-label={label} className={cn('max-w-full overflow-x-auto', className)}>
      <div className="inline-flex gap-1 rounded-full border border-border bg-surface-2 p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(o.value)}
              className={cn(
                'h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-150',
                active ? 'bg-surface text-foreground shadow-sm dark:bg-surface-3' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
