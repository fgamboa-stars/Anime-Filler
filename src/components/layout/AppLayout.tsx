import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { SearchBox } from '@/features/search/SearchBox';
import { cn } from '@/utils/cn';
import { Logo } from './Logo';
import { PageFallback } from './PageFallback';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover', end: false },
  { to: '/progress', label: 'My progress', end: false },
];

export function AppLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = location.pathname === '/';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  // New page → start at the top (filters only change the query string, so they keep scroll position).
  // Block body on purpose: newer browsers return a Promise from scrollTo(), and an
  // effect must return nothing or a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="shrink-0 rounded-md">
            <Logo />
            <span className="sr-only">, home</span>
          </Link>
          <nav aria-label="Main" className="ml-2 hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                        isActive && 'bg-secondary text-foreground',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex flex-1 items-center justify-end gap-2">
            {!isHome && <SearchBox className="hidden max-w-sm sm:block" />}
            <ThemeSwitcher className="hidden md:inline-flex" />
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full hover:bg-secondary md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="mobile-menu" className="border-t border-border px-4 pt-3 pb-5 md:hidden">
            <SearchBox className="mb-3" onNavigate={() => setMenuOpen(false)} />
            <nav aria-label="Mobile">
              <ul className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn('block rounded-xl px-3 py-2.5 text-base font-medium text-muted-foreground', isActive && 'bg-secondary text-foreground')
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeSwitcher />
            </div>
          </div>
        )}
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Anime information, ratings and artwork are provided by{' '}
            <a href="https://anilist.co" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              AniList
            </a>
            . Episode classifications come from community filler lists.
          </p>
          <p>Free to use. No account, no tracking — progress stays in your browser.</p>
        </div>
      </footer>
    </div>
  );
}
