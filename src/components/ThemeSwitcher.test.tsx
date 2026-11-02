import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useApplyTheme } from '@/hooks/useTheme';
import { usePreferencesStore } from '@/store/preferencesStore';

function Harness() {
  useApplyTheme();
  return <ThemeSwitcher />;
}

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ theme: 'system' });
    document.documentElement.classList.remove('dark');
  });

  it('exposes the three options as a labelled radio group', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Colour theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System theme' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('applies and persists the chosen theme', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(usePreferencesStore.getState().theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('aff:preferences') ?? '{}').state.theme).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Light theme' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(screen.getByRole('radio', { name: 'Light theme' })).toHaveAttribute('aria-checked', 'true');
  });
});
