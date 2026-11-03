import { lazy } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToastProvider } from '@/components/ui/toast';
import { useApplyTheme } from '@/hooks/useTheme';

// Each page is its own chunk; the home page stays in the main bundle for a fast first paint.
import HomePage from '@/pages/HomePage';
import RouteErrorPage from '@/pages/RouteErrorPage';
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const AnimePage = lazy(() => import('@/pages/AnimePage'));
const GuidesPage = lazy(() => import('@/pages/GuidesPage'));
const DiscoverPage = lazy(() => import('@/pages/DiscoverPage'));
const ProgressPage = lazy(() => import('@/pages/ProgressPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'anime/:id', element: <AnimePage /> },
      { path: 'guides', element: <GuidesPage /> },
      { path: 'discover', element: <DiscoverPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  useApplyTheme();
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
