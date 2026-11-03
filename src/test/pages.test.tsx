import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/App';
import { ToastProvider } from '@/components/ui/toast';
import { cacheClear } from '@/services/cache';
import { resetAniListState } from '@/services/anilist';
import { useProgressStore } from '@/store/progressStore';
import { media, mockAniList, page } from './anilistMock';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  return router;
}

beforeEach(() => {
  cacheClear();
  resetAniListState();
  useProgressStore.setState({ progress: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anime without filler data', () => {
  it('shows AniList metadata and the "not available" notice', async () => {
    mockAniList(() => ({ body: { data: { Media: media(154587, 'Frieren: Beyond Journey’s End', { genres: ['Adventure', 'Drama'] }) } } }));
    renderAt('/anime/154587-frieren');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Frieren: Beyond Journey’s End' }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Filler data is not currently available for this anime.')).toBeInTheDocument();
    expect(screen.getByText('Anime information is provided by AniList.')).toBeInTheDocument();
    expect(screen.getByText('Additional filler datasets may be added in future updates.')).toBeInTheDocument();
    expect(screen.getByText('Filler data coming soon')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Genres' })).toHaveTextContent('Drama');
    expect(screen.getByText('Test Studio')).toBeInTheDocument();
    // HTML in AniList descriptions is reduced to plain paragraphs.
    expect(screen.getByText('A test description.')).toBeInTheDocument();
  });

  it('redirects a numeric AniList ID to the dataset slug when filler data exists', async () => {
    mockAniList(() => ({ body: { data: { Media: media(20, 'Naruto', { episodes: 220 }) } } }));
    const router = renderAt('/anime/20?type=filler');
    await waitFor(() => expect(router.state.location.pathname).toBe('/anime/naruto'));
    expect(router.state.location.search).toBe('?type=filler');
  });
});

describe('anime with filler data', () => {
  it('lists episodes, filters from the URL and tracks progress', async () => {
    mockAniList(() => ({ body: { data: { Media: media(20, 'Naruto', { episodes: 220 }) } } }));
    renderAt('/anime/naruto?type=filler&arc=chunin-exams');

    const list = await screen.findByRole('list', { name: 'Episodes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Special Report: Live from the Forest of Death!')).toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 of 220 episodes in Chunin Exams');

    await userEvent.click(within(list).getByRole('checkbox'));
    expect(useProgressStore.getState().progress.naruto.watched).toEqual([26]);
    expect(screen.getByText('watched,', { exact: false })).toBeInTheDocument();
  });

  it('still shows the episode guide when AniList is down', async () => {
    mockAniList(() => ({ status: 503, body: { errors: [{ message: 'down' }] } }));
    renderAt('/anime/naruto-shippuden?view=watch-order');

    expect(await screen.findByRole('heading', { name: 'Canon watch order' })).toBeInTheDocument();
    expect(await screen.findByText('Showing filler data without AniList details', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Naruto Shippuden' })).toBeInTheDocument();
  });
});

describe('search', () => {
  it('corrects typos AniList cannot match and links filler-ready results', async () => {
    const fetchMock = mockAniList((vars) => {
      if (vars.search === 'blech') return { body: page([]) };
      if (vars.search === 'Bleach') return { body: page([media(269, 'Bleach', { episodes: 366 })]) };
      return { body: page([]) };
    });
    renderAt('/search?q=blech');

    expect(await screen.findByRole('link', { name: 'Bleach' })).toHaveAttribute('href', '/anime/bleach');
    expect(screen.getByText(/so we searched for/)).toHaveTextContent('Bleach');
    expect(screen.getByText('Filler data available')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to local datasets when AniList rate-limits', async () => {
    mockAniList(() => ({ status: 429, body: { errors: [{ message: 'Too Many Requests.' }] }, headers: { 'Retry-After': '60' } }));
    renderAt('/search?q=narut');

    expect(await screen.findByText('AniList search is unavailable')).toBeInTheDocument();
    expect(screen.getByText(/limiting requests/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Naruto' })).toHaveAttribute('href', '/anime/naruto');
  });

  it('offers autocomplete suggestions with keyboard navigation', async () => {
    mockAniList(() => ({ body: page([media(1735, 'Naruto Shippuden', { episodes: 500 }), media(20, 'Naruto')]) }));
    const router = renderAt('/discover');
    const [box] = await screen.findAllByRole('combobox');
    await userEvent.type(box, 'shipp');

    const listbox = await screen.findByRole('listbox');
    await within(listbox).findByRole('option', { name: /Naruto Shippuden/ });
    expect(within(listbox).getAllByRole('option')[0]).toHaveTextContent('Naruto Shippuden');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/anime/naruto-shippuden'));
  });
});

describe('guide coverage', () => {
  it('notes episodes AniList lists that the guide has not classified', async () => {
    // Every shipped guide covers a finished show; this simulates AniList listing more episodes than the guide.
    mockAniList(() => ({ body: { data: { Media: media(20, 'Naruto', { episodes: 232 }) } } }));
    renderAt('/anime/naruto');
    expect(await screen.findByText(/This guide covers episodes 1–220/, {}, { timeout: 4000 })).toHaveTextContent(
      'the newest 12 aren’t classified yet',
    );
  });
});

describe('franchises', () => {
  it('shows a season switcher linking every season of the show', async () => {
    mockAniList(() => ({ body: { data: { Media: media(21856, 'My Hero Academia Season 2', { episodes: 25 }) } } }));
    renderAt('/anime/my-hero-academia-season-2');
    const nav = await screen.findByRole('navigation', { name: 'My Hero Academia seasons' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(8);
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent('Season 2');
    expect(links[0]).toHaveAttribute('href', '/anime/my-hero-academia');
  });
});

describe('client-side navigation', () => {
  it('survives browsers where window.scrollTo returns a Promise (current Chrome)', async () => {
    const original = window.scrollTo;
    window.scrollTo = (() => Promise.resolve()) as unknown as typeof window.scrollTo;
    try {
      mockAniList(() => ({ body: page([]) }));
      const router = renderAt('/');
      await userEvent.click(screen.getAllByRole('link', { name: 'Discover' })[0]);
      expect(await screen.findByRole('heading', { level: 1, name: 'Discover' })).toBeInTheDocument();
      await userEvent.click(screen.getAllByRole('link', { name: 'My progress' })[0]);
      expect(await screen.findByRole('heading', { level: 1, name: 'My progress' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/progress');
      expect(screen.queryByText(/This page hit a problem/)).not.toBeInTheDocument();
    } finally {
      window.scrollTo = original;
    }
  });
});

describe('guides page', () => {
  it('lists every filler guide under its own nav tab', async () => {
    mockAniList(() => ({ body: page([]) }));
    const router = renderAt('/');
    await userEvent.click(screen.getAllByRole('link', { name: 'Guides' })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Filler guides' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/guides');
    expect(screen.getByRole('heading', { level: 3, name: 'Naruto' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Bleach' })).toBeInTheDocument();
  });
});
