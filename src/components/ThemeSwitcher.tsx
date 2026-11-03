import { Moon, Sun } from 'lucide-react';
import { useResolvedTheme } from '@/hooks/useTheme';
import { usePreferencesStore } from '@/store/preferencesStore';
import { cn } from '@/utils/cn';

const OPTIONS: { value: 'light' | 'dark'; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
];

/**
 * Light/dark switch, exposed to assistive tech as a radio group. Until someone picks one,
 * the site follows the device setting and the matching option shows as selected.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const theme = useResolvedTheme();
  const setTheme = usePreferencesStore((s) => s.setTheme);
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex items-center gap-0.5 border-2 border-edge bg-surface p-0.5', className)}
    >
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
              'inline-flex size-8 items-center justify-center transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-subtle-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
