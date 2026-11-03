# UI/UX audit and modernization plan

Branch: `ui-ux-improvements` (the existing UI/UX branch). Nothing here is merged to `main`.

Reference: the brief mentions an attached design reference, but none was included with it. This plan benchmarks against the inspirations it names instead (Linear, Vercel, Stripe, Notion, Perk). If you send the reference, its specifics can be folded in with a follow-up pass.

Method: read every page and component, captured screenshots at 1440px and 390px (`before/`), measured colour contrast with the WCAG formula, and ran Lighthouse on the production build.

---

## 1. Scores (before)

| Area | Score | Notes |
| --- | --- | --- |
| **Overall design** | **6.5 / 10** | Solid, functional MVP. Distinctive, but not yet "premium". |
| Visual design | 6.5 | Coherent dark theme, but tinted-indigo surfaces, mixed radii and flat borders read as "dev tool", not editorial. |
| Accessibility | 7.5 | Good semantics, skip link, ARIA combobox, 100 Lighthouse a11y. Fails non-text contrast on form controls (1.48:1). |
| Mobile responsiveness | 6 | Works, but the anime page puts ~450px of filters before the first episode; filters don't collapse. |
| Consistency | 5.5 | Five different "pill" implementations, radii from 3px to 24px with no rule, cards hand-rolled per page. |
| Information hierarchy | 6.5 | Section headings barely outrank card titles; the home page has two competing strips; the anime page is one long scroll. |

Measured contrast (current dark theme):

| Pair | Ratio | WCAG |
| --- | --- | --- |
| Body text on background | 15.2:1 | ✅ AAA |
| Muted text on card | 6.9:1 | ✅ AA |
| Filler red text on card | 5.6:1 | ✅ AA |
| **Input / border vs. card** | **1.48:1** | ❌ 1.4.11 needs 3:1 |
| Card border vs. page | 1.47:1 | (decorative, OK) |

## 2. Top 10 design weaknesses

1. **No light mode.** The theme is hard-coded dark (`<html class="dark">`, fixed `color-scheme`, fixed `theme-color`).
2. **No colour discipline.** Indigo-tinted greys everywhere, plus raw classification colours (`bg-canon/12`, `text-filler`) reused for UI states such as warnings and progress. Accent colour isn't reserved for meaning.
3. **Inconsistent shape language.** Radii of 3, 6, 8, 12, 16, 18 and 24px plus `rounded-full`, with no rule for which to use.
4. **Flat surfaces.** Cards are a 1px border on a near-identical background, with no elevation scale. Depth only appears on the search popover.
5. **Weak type hierarchy.** Arbitrary sizes (`text-[15px]`, `text-[13px]`, three different `clamp()` headlines). Section H2s are only slightly larger than card titles.
6. **Mobile filter wall.** On the anime page, type chips, three selects and two buttons all stack before the list (about 450px at 390px wide).
7. **Duplicated controls.** "Share current view" appears in the tab bar *and* in the no-data notice; the tab bar doubles as a page header.
8. **The data viz lacks context.** The episode strip has no scale (where is episode 100?), the legend is small, and the watch-order stats are plain boxes.
9. **Notices are styled ad hoc.** Warning, error, empty and info states each hand-roll their own tint, border and icon colours.
10. **Small touch targets.** The "mark up to here" icon button is 32px, chips are 36px and select heights are 40px. Mobile guidance is 44px.

## 3. Technical design debt

- `Card` exists in `components/ui` but no page uses it; every page hand-rolls `rounded-xl border bg-card p-*`.
- Five near-identical pill implementations: filter chips, the season switcher, the tab bar, the "All types" chip and the search "Filler data" tag.
- Hex colours in components (`#3b3470` fallback gradient, inline `style` colours) bypass tokens.
- No spacing, shadow or type tokens, only Tailwind defaults plus arbitrary values.
- Native `<select>`s get browser-default arrows, which differ per OS.
- Theme colour and `color-scheme` are fixed in `index.html`.

## 4. Opportunities

- A true **black / white / grayscale** system with semantic tokens, so accent colour appears only where it means something: classification data, CTAs, success, warning and error.
- **Light and dark** themes, following the OS by default, with an explicit switch and no flash of the wrong theme.
- **Editorial pages:** oversized headlines, a stats band, generous section spacing, report-style anime pages.
- **One component kit** (Button, Card, Badge, Chip, SegmentedControl, Select, Input, Notice, Stat, SectionHeader) used everywhere.
- **Collapsible filters** on mobile, with a count of active filters.
- **Annotated episode strip** with episode markers, so it reads like a chart.

## 5. Prioritized roadmap

| # | Change | Impact | Effort | Risk |
| --- | --- | --- | --- | --- |
| 1 | Design tokens + light/dark theme + theme switcher | Very high | M | Low: CSS variables only |
| 2 | Component kit (buttons, cards, chips, segmented control, select, notice) | High | M | Low: same props/behaviour |
| 3 | Header/footer + page shells (container, section rhythm) | High | S | Low |
| 4 | Anime page: overview card, segmented tabs, collapsible mobile filters, list styling | Very high | M | Medium: most complex page |
| 5 | Home: editorial hero, stats band, showcase card, guide cards | High | S | Low |
| 6 | Discover / Search / Progress / 404 / error page | Medium | S | Low |
| 7 | Data viz: strip axis, legend, stat cards | Medium | S | Low |
| 8 | Accessibility pass (contrast, 44px targets, focus) + Lighthouse in both themes | High | S | Low |

## 6. Design system proposal

**Colour.** Neutral grayscale for all chrome. Semantic colours only for state. Classification colours only for episode data.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | #fafafa | #000000 | Page |
| `surface` | #ffffff | #0a0a0a | Cards |
| `surface-2` | #f4f4f5 | #141414 | Insets, hovers, inputs |
| `foreground` | #171717 | #ededed | Text (off-black / off-white) |
| `muted-foreground` | #525252 | #a1a1a1 | Secondary text |
| `subtle-foreground` | #6b6b6b | #8f8f8f | Captions (still ≥ 4.5:1) |
| `border` | #e6e6e6 | #1f1f1f | Decorative dividers |
| `border-strong` | #8a8a8a | #6b6b6b | Form controls (≥ 3:1) |
| `primary` | #171717 | #ededed | CTA (inverted) |
| `success / warning / danger` | green / amber / red | lighter tints | States |
| `canon / mixed / anime-canon / filler` | deeper hues | brighter hues | Episode data only |

**Type.** Geist (variable) for everything, with tabular numerals for data. Scale: display `clamp(2.75rem, 7vw, 5.25rem)`, h1 `clamp(2.25rem, 5vw, 3.75rem)`, h2 `1.75rem → 2.25rem`, h3 `1.125rem`, body `1rem / 1.6`, small `0.875rem`, caption `0.8125rem`. Headlines are semibold with tight tracking (−0.04em).

**Shape.** Radius `sm 8 / md 12 / lg 16 / xl 20 / 2xl 24`. Cards use 24px, inputs 12px, buttons and chips are pills.

**Elevation.** Light theme: soft layered shadows. Dark theme: a hairline border plus a faint inner top highlight, since dark UIs show depth through light, not shadow.

**Spacing.** 4px base. Sections are 96px apart on desktop and 64px on mobile. Card padding is 24px (32px on large cards). The container is 1200px wide with 20 / 32px gutters.

**Motion.** 150–200ms colour and transform transitions, one orchestrated strip reveal on the home page, and everything disabled under `prefers-reduced-motion`.

## 7. Dark / light mode strategy

- **Choice and storage:** a preference of `system | light | dark` is stored in the existing Zustand preferences store (`localStorage`). `system` is the default and follows `prefers-color-scheme` live.
- **No flash:** a tiny inline script in `index.html` applies the `dark` class and `color-scheme` before first paint.
- **One set of components:** all colours are CSS variables swapped under `.dark`, so components have no theme-specific code.
- **Browser chrome:** `<meta name="theme-color">` is updated with the theme.
- **Switcher:** a three-option control (System / Light / Dark) in the header and mobile menu, built as a radio group for screen readers.

## 8. Accessibility recommendations

- Raise form-control borders to at least 3:1 (WCAG 1.4.11).
- Verify every text and colour pair is at least 4.5:1 in **both** themes (automated script in the verification step).
- Make interactive targets at least 44px on touch layouts.
- Use one consistent focus ring (2px, high-contrast, offset) everywhere.
- Never use colour alone: classification badges keep their icon and text, and the strip keeps its text alternative.
- Add `aria-expanded` and `aria-controls` to the collapsible filter panel, and show the active-filter count in the button's accessible name.
- Keep the existing landmarks, skip link, live regions and combobox pattern.

## 9. Performance considerations

- **Fonts:** Geist replaces two font families with one (fewer bytes), and stays self-hosted.
- **Theming:** pure CSS variables, so switching themes causes no re-render and costs no JavaScript.
- **Imagery:** no new images; shadows are CSS-only.
- **Visual effects:** backdrop blur only on the sticky header.
- **Targets:** keep home ≥ 90 and anime pages ≥ 90 on Lighthouse mobile performance, re-measured after the change.
