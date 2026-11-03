import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/store/preferencesStore';

const QUERY = '(prefers-color-scheme: dark)';
const THEME_COLORS = { light: '#fafafa', dark: '#000000' } as const;

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;
}

/** Resolved theme ("light" | "dark"), following the OS when the preference is "system". */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = usePreferencesStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

/** Keep <html class="dark"> and the browser theme-color in sync with the preference. */
export function useApplyTheme(): void {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_COLORS[theme];
    }
  }, [theme]);
}
