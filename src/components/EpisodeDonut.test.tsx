import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EpisodeDonut, formatShare } from './EpisodeDonut';

const counts = { CANON: 232, MIXED: 64, ANIME_CANON: 1, FILLER: 203 };

describe('formatShare', () => {
  it('rounds to one decimal and drops trailing zeros', () => {
    expect(formatShare(203, 500)).toBe('40.6%');
    expect(formatShare(50, 100)).toBe('50%');
    expect(formatShare(1, 5000)).toBe('<0.1%');
    expect(formatShare(0, 0)).toBe('0%');
  });
});

describe('EpisodeDonut', () => {
  it('labels the chart and lists every type with its share and count', () => {
    render(<EpisodeDonut counts={counts} label="Naruto Shippuden split" />);
    expect(screen.getByRole('img', { name: 'Naruto Shippuden split' })).toBeInTheDocument();
    const legend = screen.getByText('Episodes by type').closest('figcaption')!;
    expect(within(legend).getByText('Filler')).toBeInTheDocument();
    expect(within(legend).getByText('203 episodes')).toBeInTheDocument();
    expect(within(legend).getByText('1 episode')).toBeInTheDocument();
    expect(within(legend).getAllByText('40.6%')).toHaveLength(1);
  });

  it('skips types with no episodes', () => {
    render(<EpisodeDonut counts={{ CANON: 59, MIXED: 0, ANIME_CANON: 0, FILLER: 0 }} label="JJK" />);
    expect(screen.queryByText('Filler')).not.toBeInTheDocument();
    expect(screen.getByText('59 episodes')).toBeInTheDocument();
  });

  it('brings a hovered type into the centre', async () => {
    const user = userEvent.setup();
    const { container } = render(<EpisodeDonut counts={counts} label="split" />);
    const centre = container.querySelector('[aria-hidden].absolute')!;
    expect(centre).toHaveTextContent('40.6%filler');
    await user.hover(screen.getByRole('button', { name: /Canon/ }));
    expect(centre).toHaveTextContent('46.4%canon');
  });

  it('pins a type from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(<EpisodeDonut counts={counts} label="split" />);
    const centre = container.querySelector('[aria-hidden].absolute')!;
    const mixed = screen.getByRole('button', { name: /Mixed/ });
    mixed.focus();
    await user.keyboard('{Enter}');
    expect(mixed).toHaveAttribute('aria-pressed', 'true');
    mixed.blur();
    expect(centre).toHaveTextContent('12.8%mixed');
  });
});
