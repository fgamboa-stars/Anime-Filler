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
      <header className="sticky top-0 z-30 border-b-2 border-edge bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="container-page flex h-16 items-center gap-4">
          <Link to="/" className="-mx-1 inline-flex h-11 shrink-0 items-center rounded-lg px-1">
            <Logo />
            <span className="sr-only">, home</span>
          </Link>
          <nav aria-label="Main" className="ml-4 hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex h-9 items-center rounded-md border-2 border-transparent px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground',
                        isActive && 'border-edge bg-surface text-foreground',
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
              className="-mr-1 inline-flex size-11 items-center justify-center rounded-md border-2 border-edge bg-surface md:hidden"
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
          <div id="mobile-menu" className="animate-fade-in border-t-2 border-edge px-4 pt-4 pb-6 md:hidden">
            <SearchBox className="mb-3" onNavigate={() => setMenuOpen(false)} />
            <nav aria-label="Mobile">
              <ul className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          'flex h-12 items-center rounded-md px-3 text-lg font-semibold text-muted-foreground',
                          isActive && 'bg-primary text-primary-foreground',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 flex items-center justify-between border-t-2 border-edge pt-4">
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

      <footer className="mt-20 border-t-2 border-edge bg-surface">
        <div className="container-page flex flex-col gap-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <Logo />
          <div className="max-w-xl space-y-2 sm:text-right">
            <p>
              Anime information, ratings and artwork are provided by{' '}
              <a
                href="https://anilist.co"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
              >
                AniList
              </a>
              . Episode classifications come from community filler lists.
            </p>
            <p>Free to use. No account, no tracking — progress stays in your browser.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
