import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useEpisodeFilters } from './useEpisodeFilters';

function Harness() {
  const { filters, view, setFilters, setView, resetFilters } = useEpisodeFilters('naruto');
  const location = useLocation();
  return (
    <div>
      <output data-testid="search">{location.search}</output>
      <output data-testid="types">{filters.types.join(',')}</output>
      <output data-testid="arc">{filters.arc ?? ''}</output>
      <output data-testid="view">{view}</output>
      <button onClick={() => setFilters({ types: ['FILLER'] })}>filler</button>
      <button onClick={() => setFilters({ arc: 'chunin-exams' })}>arc</button>
      <button onClick={() => setView('watch-order')}>watch order</button>
      <button onClick={resetFilters}>reset</button>
    </div>
  );
}

function setup(initial: string) {
  const router = createMemoryRouter([{ path: '/anime/:id', element: <Harness /> }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('URL-backed episode filters', () => {
  it('restores filters from a deep link (refresh / bookmark)', () => {
    setup('/anime/naruto?type=filler,canon&arc=chunin-exams&view=arcs');
    expect(screen.getByTestId('types')).toHaveTextContent('FILLER,CANON');
    expect(screen.getByTestId('arc')).toHaveTextContent('chunin-exams');
    expect(screen.getByTestId('view')).toHaveTextContent('arcs');
  });

  it('writes filter changes to the URL', async () => {
    setup('/anime/naruto');
    await userEvent.click(screen.getByText('filler'));
    expect(screen.getByTestId('search')).toHaveTextContent('?type=filler');
    await userEvent.click(screen.getByText('arc'));
    expect(screen.getByTestId('search')).toHaveTextContent('?type=filler&arc=chunin-exams');
  });

  it('supports the back and forward buttons', async () => {
    const router = setup('/anime/naruto');
    await userEvent.click(screen.getByText('filler'));
    await userEvent.click(screen.getByText('arc'));
    await act(() => router.navigate(-1));
    expect(screen.getByTestId('arc')).toHaveTextContent('');
    expect(screen.getByTestId('types')).toHaveTextContent('FILLER');
    await act(() => router.navigate(-1));
    expect(screen.getByTestId('types')).toHaveTextContent('');
    await act(() => router.navigate(1));
    expect(screen.getByTestId('types')).toHaveTextContent('FILLER');
  });

  it('keeps the view when filters reset, and filters when the view changes', async () => {
    setup('/anime/naruto?type=filler');
    await userEvent.click(screen.getByText('watch order'));
    expect(screen.getByTestId('search')).toHaveTextContent('?type=filler&view=watch-order');
    await userEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('search')).toHaveTextContent('?view=watch-order');
  });

  it('remembers the last filters per anime in the preferences store', async () => {
    setup('/anime/naruto');
    await userEvent.click(screen.getByText('filler'));
    expect(usePreferencesStore.getState().lastFilters.naruto).toBe('type=filler');
  });
});
