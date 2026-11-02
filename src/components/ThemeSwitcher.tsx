import { Monitor, Moon, Sun } from 'lucide-react';
import { usePreferencesStore, type ThemePreference } from '@/store/preferencesStore';
import { cn } from '@/utils/cn';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
];

/** Three-way theme control, exposed to assistive tech as a radio group. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-full transition-colors',
              active ? 'bg-surface-3 text-foreground' : 'text-subtle-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
