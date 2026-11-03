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
      <div className="inline-flex gap-1 border-2 border-edge bg-surface p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(o.value)}
              className={cn(
                'h-9 shrink-0 px-4 text-xs font-bold tracking-[0.06em] uppercase transition-[background-color,color] duration-150',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
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
