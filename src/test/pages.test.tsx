import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/App';
import { ToastProvider } from '@/components/ui/toast';
import { cacheClear } from '@/services/cache';
import { resetAniListState, searchAnime } from '@/services/anilist';
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
  localStorage.clear();
  cacheClear();
  resetAniListState();
  useProgressStore.setState({ progress: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anime without filler data', () => {
  it('shows AniList metadata and the "not available" notice', async () => {
    // 52 episodes: too long to count as "likely no filler".
    mockAniList(() => ({
      body: { data: { Media: media(154587, 'Frieren: Beyond Journey’s End', { genres: ['Adventure', 'Drama'], episodes: 52 }) } },
    }));
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

  it('says a short finished series likely has no filler', async () => {
    mockAniList(() => ({ body: { data: { Media: media(154587, 'Frieren: Beyond Journey’s End', { episodes: 12 }) } } }));
    renderAt('/anime/154587-frieren');

    expect(await screen.findByText('No filler guide yet, but this anime likely has no filler.', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/finished TV series of 12 episodes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'More likely no-filler anime' })).toHaveAttribute(
      'href',
      '/discover?cat=no-filler&nofiller=likely',
    );
  });

  it('does not call an airing series likely filler-free', async () => {
    mockAniList(() => ({ body: { data: { Media: media(154587, 'Frieren: Beyond Journey’s End', { episodes: 12, status: 'RELEASING' }) } } }));
    renderAt('/anime/154587-frieren');

    expect(await screen.findByText('Filler data is not currently available for this anime.', {}, { timeout: 4000 })).toBeInTheDocument();
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

  it('keeps cover art in suggestions while AniList rate-limits', async () => {
    const cover = { extraLarge: null, large: 'https://img.test/naruto-l.jpg', medium: 'https://img.test/naruto.jpg', color: null };
    // An earlier visit got Naruto from AniList, so its cover is remembered.
    mockAniList(() => ({ body: page([media(20, 'Naruto', { coverImage: cover, seasonYear: 2002 })]) }));
    await searchAnime('naruto');
    mockAniList(() => ({ status: 429, body: { errors: [{ message: 'Too Many Requests.' }] }, headers: { 'Retry-After': '60' } }));

    renderAt('/discover');
    const [box] = await screen.findAllByRole('combobox');
    await userEvent.type(box, 'naru');
    const listbox = await screen.findByRole('listbox');
    await within(listbox).findByText(/AniList is busy right now/, {}, { timeout: 4000 });
    const naruto = within(listbox).getByRole('option', { name: /^Naruto(?! Shippuden)/ });
    expect(naruto.querySelector('img')).toHaveAttribute('src', 'https://img.test/naruto.jpg');
    expect(naruto).toHaveTextContent('2002');
    // Guides never seen on AniList get the title's first letter instead of an empty box.
    const shippuden = within(listbox).getByRole('option', { name: /Naruto Shippuden/ });
    expect(shippuden.querySelector('img')).toBeNull();
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

describe('discover: no filler', () => {
  it('lists verified filler-free guides, then AniList estimates without a guide', async () => {
    mockAniList((_variables, query) => {
      if (query.includes('episodes_lesser'))
        return {
          body: {
            data: {
              Page: {
                pageInfo: { hasNextPage: false },
                media: [
                  media(154587, 'Frieren: Beyond Journey’s End', { episodes: 28 }), // too long: filtered out
                  media(4224, 'Toradora!', { episodes: 25 }), // has a guide: covered by "Verified"
                  media(1, 'Cowboy Bebop', { episodes: 26 }),
                ],
              },
            },
          },
        };
      return { body: page([]) };
    });
    const router = renderAt('/discover?cat=no-filler');

    const section = await screen.findByRole('region', { name: 'No filler' });
    // The preview shows the most popular few; open the full list.
    await userEvent.click(within(section).getByRole('button', { name: /^Show all [0-9]+$/ }));
    // Death Note's guide has no filler episodes; Naruto's does.
    expect(within(section).getByRole('heading', { level: 3, name: 'Death Note' })).toBeInTheDocument();
    expect(within(section).queryByRole('heading', { level: 3, name: 'Naruto' })).not.toBeInTheDocument();
    expect(within(section).getAllByText('No filler').length).toBeGreaterThan(0);

    await userEvent.click(within(section).getByRole('button', { name: 'Likely' }));
    expect(router.state.location.search).toBe('?cat=no-filler&nofiller=likely');
    expect(await within(section).findByRole('heading', { level: 3, name: 'Cowboy Bebop' })).toBeInTheDocument();
    expect(within(section).getByText('Likely no filler')).toBeInTheDocument();
    expect(within(section).queryByRole('heading', { level: 3, name: 'Toradora!' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('heading', { level: 3, name: /Frieren/ })).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});

describe('discover: guides and categories', () => {
  // AniList genres for a few guides (Naruto, Death Note, Toradora!).
  const withGenres = () =>
    mockAniList((_variables, query) =>
      query.includes('id_in')
        ? {
            body: page([
              media(20, 'Naruto', { genres: ['Action', 'Adventure'] }),
              media(1535, 'Death Note', { genres: ['Mystery', 'Thriller'] }),
              media(4224, 'Toradora!', { genres: ['Romance', 'Comedy'] }),
            ]),
          }
        : { body: page([]) },
    );

  it('lists the filler guides under Discover, and old /guides links land there', async () => {
    withGenres();
    const router = renderAt('/guides');
    expect(await screen.findByRole('heading', { level: 1, name: 'Discover' }, { timeout: 8000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/discover');
    expect(screen.queryByRole('link', { name: 'Guides' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Naruto' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Bleach' })).toBeInTheDocument();
  });

  it('filters guides by genre and by length', async () => {
    withGenres();
    const router = renderAt('/discover');
    const genres = await screen.findByRole('group', { name: 'Filter by genre' }, { timeout: 8000 });
    await userEvent.click(within(genres).getByRole('button', { name: /^Thriller/ }));
    expect(router.state.location.search).toBe('?genre=Thriller');
    expect(screen.getByRole('heading', { level: 3, name: 'Death Note' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Naruto' })).not.toBeInTheDocument();

    await userEvent.click(within(genres).getByRole('button', { name: 'All genres' }));
    const categories = screen.getByRole('navigation', { name: 'Categories' });
    await userEvent.click(within(categories).getByRole('button', { name: 'Long-running' }));
    expect(router.state.location.search).toBe('?cat=long');
    expect(await screen.findByRole('heading', { level: 3, name: 'Naruto' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Death Note' })).not.toBeInTheDocument();

    await userEvent.click(within(categories).getByRole('button', { name: 'Short series' }));
    // Many short series: narrow to one genre so Toradora! is on the first page of cards.
    await userEvent.click(within(screen.getByRole('group', { name: 'Filter by genre' })).getByRole('button', { name: /^Romance/ }));
    expect(router.state.location.search).toBe('?cat=short&genre=Romance');
    expect(await screen.findByRole('heading', { level: 3, name: 'Toradora!' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Naruto' })).not.toBeInTheDocument();
  });
});

describe('home: filler rankings', () => {
  it('minimizes, maximizes and "closes" (minimizes) a ranking window, and remembers it', async () => {
    mockAniList(() => ({ body: page([]) }));
    renderAt('/');
    const minimize = await screen.findByRole('button', { name: 'Minimize Most filler' });
    const ranking = minimize.closest('section')!;
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(8);

    await userEvent.click(within(ranking).getByRole('button', { name: 'Maximize Most filler' }));
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(20);

    // × does not remove the window: it minimizes it, and any button brings it back.
    await userEvent.click(within(ranking).getByRole('button', { name: 'Close Most filler (minimizes it)' }));
    expect(within(ranking).queryAllByRole('listitem')).toHaveLength(0);
    expect(ranking).toHaveTextContent('most-filler.txt');
    expect(localStorage.getItem('aff:window:most-filler')).toBe('minimized');

    await userEvent.click(within(ranking).getAllByRole('button', { name: 'Restore Most filler' })[0]);
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(8);
    // The other window is untouched.
    const least = screen.getByRole('button', { name: 'Minimize Least filler' }).closest('section')!;
    expect(within(least).getAllByRole('listitem')).toHaveLength(8);
  });
});

describe('anime-original series', () => {
  it('explains a series whose every episode is filler', async () => {
    mockAniList(() => ({ body: { data: { Media: media(2390, 'Kirby: Right Back at Ya!', { episodes: 100 }) } } }));
    renderAt('/anime/kirby-right-back-at-ya');
    expect(await screen.findByText('Every episode is marked filler because this anime tells its own story.', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('does not say so for an all-filler season of a franchise with canon', async () => {
    mockAniList(() => ({ body: { data: { Media: media(72, 'Full Metal Panic? Fumoffu', { episodes: 12 }) } } }));
    renderAt('/anime/full-metal-panic-fumoffu');
    expect(await screen.findByRole('navigation', { name: 'Full Metal Panic! seasons' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/this anime tells its own story/)).not.toBeInTheDocument();
  });
});

describe('discover: likely list', () => {
  it('keeps loading AniList pages until there are shows without a guide to list', async () => {
    const fetchMock = mockAniList((variables, query) => {
      if (!query.includes('episodes_lesser')) return { body: page([]) };
      const first = variables.page === 1;
      return {
        body: {
          data: {
            Page: {
              pageInfo: { hasNextPage: first },
              // Page 1 holds only a show that has a guide.
              media: first ? [media(4224, 'Toradora!', { episodes: 25 })] : [media(1, 'Cowboy Bebop', { episodes: 26 })],
            },
          },
        },
      };
    });
    renderAt('/discover?nofiller=likely');
    const section = await screen.findByRole('region', { name: 'No filler' });
    expect(await within(section).findByRole('heading', { level: 3, name: 'Cowboy Bebop' }, { timeout: 4000 })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => String((init as RequestInit).body).includes('"page":2'))).toBe(true);
  });
});

describe('discover: likely list request budget', () => {
  it('fetches at most three AniList pages per load or "Show more"', async () => {
    const likelyPages = () => fetchMock.mock.calls.filter(([, init]) => String((init as RequestInit).body).includes('episodes_lesser')).length;
    // Every page holds only a show that already has a guide, so the list never fills up.
    const fetchMock = mockAniList((_variables, query) => {
      if (!query.includes('episodes_lesser')) return { body: page([]) };
      return { body: { data: { Page: { pageInfo: { hasNextPage: true }, media: [media(4224, 'Toradora!', { episodes: 25 })] } } } };
    });
    renderAt('/discover?nofiller=likely');
    const section = await screen.findByRole('region', { name: 'No filler' });
    const more = await within(section).findByRole('button', { name: 'Show more' }, { timeout: 4000 });
    await waitFor(() => expect(more).toBeEnabled());
    expect(likelyPages()).toBe(3);

    await userEvent.click(more);
    await waitFor(() => expect(likelyPages()).toBe(6));
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Show more' })).toBeEnabled());
    expect(likelyPages()).toBe(6);
  });
});
