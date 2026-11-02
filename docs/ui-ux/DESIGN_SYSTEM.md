# Filler Finder design system

A grayscale, type-led system with two themes. Colour is reserved for meaning: status (success, warning, danger, info) and the four episode types. Everything else is black, white or gray.

Tokens are CSS custom properties in `src/index.css`. Light values sit on `:root` and dark values on `.dark`. They are mapped into Tailwind with `@theme inline`, so `bg-surface`, `text-muted-foreground` and similar classes switch automatically with the theme.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #fafafa | #000000 | Page |
| `surface` | #ffffff | #0a0a0a | Cards, fields, menus |
| `surface-2` | #f4f4f5 | #141414 | Hover and selected rows, segmented track, skeletons |
| `surface-3` | #ebebec | #1c1c1c | Pressed and selected on surface-2 |
| `foreground` | #171717 | #ededed | Body and headings |
| `muted-foreground` | #525252 | #a1a1a1 | Secondary text |
| `subtle-foreground` | #646464 | #8f8f8f | Tertiary text, captions, icons |
| `border` | #e6e6e6 | #1f1f1f | Hairlines and dividers (decorative) |
| `border-strong` / `input` | #8a8a8a | #6b6b6b | Field outlines (≥3:1) |
| `primary` / `primary-foreground` | #171717 / #fafafa | #ededed / #0a0a0a | The one filled button style |
| `ring` | #171717 | #ededed | Focus outline |
| `success` · `warning` · `danger` · `info` | #15803d · #b45309 · #b91c1c · #1d4ed8 | #4ade80 · #fbbf24 · #f87171 · #60a5fa | Status icons, notice tints |
| `canon` · `mixed` · `anime-canon` · `filler` | #059669 · #d97706 · #2563eb · #dc2626 | #10b981 · #f59e0b · #3b82f6 · #ef4444 | Data marks: strips, swatches, stripes (≥3:1) |
| `*-text` (canon, mixed, anime-canon, filler) | #047857 · #b45309 · #1d4ed8 · #b91c1c | #34d399 · #fbbf24 · #60a5fa · #f87171 | Coloured text and badge labels (≥4.5:1) |
| `track` | #e6e6e6 | #262626 | Progress and watched tracks |

**Rules**
- Use a data colour only where it encodes an episode type.
- Use a `*-text` token whenever the colour is on text.
- Never put body text in a status colour. A notice tints its border and icon, and the copy stays neutral.

**Verified contrast.** All 52 checked pairs pass: text at ≥4.5:1 on every surface, data marks and field borders at ≥3:1.

## Typography

**Geist Variable** for everything. Tabular numerals (`tabular`) for counts, percentages and episode numbers.

| Utility | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display` | clamp(44px, 7vw, 84px) | 0.95 | −0.045em | 650 | Home hero only |
| `text-title` | clamp(36px, 5vw, 60px) | 1.0 | −0.04em | 650 | Page h1 |
| `text-heading` | clamp(26px, 2.6vw, 36px) | 1.1 | −0.03em | 620 | Section h2 |
| `text-subheading` | 18px | 1.35 | −0.015em | 600 | Card titles |
| `text-lead` | clamp(17px, 1.6vw, 20px) | 1.55 | −0.01em | 400, muted | Intro paragraphs |
| body | 15–16px | 1.5 | — | 400 | |
| `text-caption` | 13px | 1.4 | — | 400 | Field labels, metadata |

## Shape, elevation and space

- **Radius:** `sm` 8, `md` 12, `lg` 16, `xl` 20, `2xl` 24.
  - Cards use 24 (`surface-card`).
  - Posters use 16, fields and filter buttons 20.
  - Buttons, chips and nav are full pills.
  - Checkboxes use 7px.
- **Elevation:** `shadow-xs` (controls), `shadow-sm` (cards), `shadow-md` (hovered cards), `shadow-lg` (menus, toasts, showcase). In dark mode, cards also get a 1px top highlight.
- **Spacing:** 4px base.
  - Page container is 1200px with 16/24/32px gutters (`container-page`).
  - Sections are separated by 80–96px on desktop and 64px on phones.
  - Card padding is 20px on phones and 24–32px on desktop.

## Components (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button` | Variants: `default` (inverted), `secondary`, `outline`, `ghost`, `link`. Heights 44 / 36 / 48. Use one `default` per view. |
| `Badge` | `default` (neutral), `outline`, `solid`, plus episode-type variants on 10% tints. |
| `Card` | `surface-card`, with optional `interactive` hover elevation. |
| `Input`, `Select` | Shared `fieldClass`: 44px tall, 3:1 border, 4px focus halo. `Select` is native, with a chevron. |
| `ToggleChip` | Pill with `aria-pressed`, used for filters. |
| `Segmented` | View switcher: a `nav` of buttons with `aria-current`. |
| `Notice` | Tones: `neutral`, `info`, `warning`, `danger`, `success`. Optional title (p/h2/h3) and actions. |
| `SectionHeader`, `Stat` | Section opener; figure plus label as a `dt`/`dd` pair. |
| `Progress`, `Skeleton`, `Toast` | 8px grayscale bar; rounded shimmer; neutral pill with a status icon. |
| `EpisodeStrip` | `sm` (10px) or `lg` (48/64px), optional `showAxis` and `animate`, watched track underneath. |
| `ThemeSwitcher` | System / Light / Dark `radiogroup`. |

## Theming

- **Preference.** `theme: 'system' | 'light' | 'dark'` in `preferencesStore`, persisted under `aff:preferences`.
- **First paint.** An inline script in `index.html` sets `html.dark` before first paint, so there is no flash of the wrong theme.
- **Live updates.** `useApplyTheme` (in `App`) keeps the class and `<meta name="theme-color">` in sync, and listens for OS changes while set to `system`.
- **Writing components.** Use tokens only, never hex values. Reach for the `dark:` variant only for deliberate per-theme differences, such as raising a surface one step in dark mode.

## Motion

- Durations are 150–200ms for state changes. The episode strip reveal runs once at 1s.
- `prefers-reduced-motion` turns off animations, transitions and hover lifts.
