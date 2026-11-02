# UI/UX modernization: change log

Each significant change on the `ui-ux-improvements` branch is recorded here. Every entry covers what changed, why it helps usability and visual quality, the accessibility and mobile effects, tradeoffs and risks, and which files changed. Behaviour, routes, URLs, stored data and data files are unchanged throughout unless an entry says otherwise.

---

## 1. Design tokens, typography and light/dark theming

**What changed**
- Replaced the single purple-tinted dark palette with a grayscale token system that has two themes. Light uses #fafafa, white surfaces and #171717 ink. Dark uses true black, #0a0a0a surfaces and #ededed ink. Both themes define semantic tokens for surfaces, text, borders and status, plus data tokens for the four episode types.
- Colour is limited to status (success, warning, danger, info) and the episode-type data colours. Everything else, including primary buttons, is black or white.
- Switched the type family to Geist Variable for both display and body text. This replaces the Bricolage Grotesque and Figtree packages and saves one font download. Added named type utilities (`text-display`, `text-title`, `text-heading`, `text-subheading`, `text-lead`, `text-caption`, `tabular`).
- Defined a radius scale (8/12/16/20/24), a four-step elevation scale with a hairline top highlight in dark mode, and a `surface-card` utility.
- Added a `theme` preference (`system` | `light` | `dark`, default `system`) to the existing persisted preferences store.
- An inline script in `index.html` applies the saved theme before first paint, so the page never flashes the wrong theme.
- `useApplyTheme` keeps the `dark` class and the browser `theme-color` in sync, and follows OS changes live when set to `system`.
- Added a three-way theme switcher to the desktop header and the mobile menu.
- Removed the cover-colour wash behind the anime hero, which put arbitrary hues behind the title.

**Why it helps usability**
- People can now read in the theme that suits their room and device, and the choice is remembered.
- With accents reserved for meaning, a red or green element always signals something: filler, canon, an error or a success.

**Why it helps visual quality**
- A disciplined grayscale base with one type family reads as calm and premium, in the direction of Linear and Vercel.
- The episode-type colours become the only saturated elements, so the episode strips now carry the page visually.

**Accessibility**
- Every text token meets 4.5:1 against every surface it sits on, in both themes.
- Control borders (`border-strong`) and data colours meet 3:1 (WCAG 1.4.11). The old input border was 1.48:1.
- A global `:focus-visible` outline uses the high-contrast `ring` token.
- The switcher is a labelled `radiogroup` with `aria-checked` radios.
- Reduced-motion settings disable animations.

**Mobile**
- The theme switcher sits in the mobile menu.
- `theme-color` follows the theme, so the browser chrome on phones matches the page.

**Tradeoffs and risks**
- Components still use legacy class names (`bg-card`, `bg-secondary`). These are mapped to the new tokens as aliases so nothing breaks, and they are migrated in later entries.
- AniList banner images remain in colour because they are content, not chrome.

**Files**
`index.html`, `package.json`, `package-lock.json`, `src/index.css`, `src/store/preferencesStore.ts`, `src/hooks/useTheme.ts` (new), `src/components/ThemeSwitcher.tsx` (new), `src/App.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/EpisodeStrip.tsx`, `src/components/ui/progress.tsx`, `src/features/anime/AnimeHero.tsx`

---

## 2. Component kit and app shell

**What changed**
- **Button.** Sizes are now 44px (default), 36px (sm) and 48px (lg). The primary button is inverted (black or white), and only one appears per view. Secondary, outline and ghost buttons stay in grayscale. Buttons scale slightly when pressed.
- **Badge.** The neutral badge is now the default. Episode-type badges use AA-contrast `*-text` tokens on a 10% tint, and the "Filler data coming soon" badge is now neutral rather than amber.
- **Card.** Uses the `surface-card` style (24px radius, hairline border, soft shadow with a dark-mode top highlight) and has an optional `interactive` hover elevation.
- **New components:**
  - `Select`: a native select with a chevron.
  - `ToggleChip`: an `aria-pressed` pill.
  - `Segmented`: a view switcher.
  - `Notice`: info/warning/danger/success/neutral callouts.
  - `SectionHeader` and `Stat`.
  - Shared `fieldClass` for inputs.
- **StateMessage.** Restyled as a card with an icon well, a subheading and an outline retry button.
- **Toast, Skeleton and Progress.** Toasts are neutral surfaces with a coloured status icon. Skeletons are rounded-xl on `surface-2`. Progress bars are 8px and use grayscale ink.
- **Episode strip.** The large strip is 48/64px tall with 6px rounding, and the watched track is thicker. A new `showAxis` option prints the first and last episode numbers. Legend swatches are larger.
- **Posters.** 16px radius, a neutral placeholder instead of the cover-colour tint, and an inner hairline so dark artwork doesn't bleed into the page.
- **Shell.**
  - The page container is 1200px with 16/24/32px gutters (`container-page`).
  - The header is translucent, with a hairline border and 36px nav pills.
  - The mobile menu has 48px rows and the theme switcher.
  - The footer carries the wordmark and right-aligned credits.
- **Search.** The search box has a 3:1 border and a soft focus halo, and the hero size is 64px on larger screens. The suggestion panel uses the surface tokens.

**Why it helps usability**
- Touch targets meet 44px on the main controls.
- Every interactive state (hover, pressed, focus, selected) is visible in both themes.
- Callouts now have one consistent shape, so people learn to recognise them.

**Why it helps visual quality**
- One radius scale and one elevation scale replace the mix of `rounded-lg`, `rounded-xl` and `rounded-2xl` on similar surfaces.
- Monochrome chrome lets the episode strip and status colours stand out.

**Accessibility**
- Badge text meets ≥4.5:1 in both themes.
- Field borders meet ≥3:1, and focus rings are visible on every control.
- The theme switcher and chips expose state with `aria-checked` and `aria-pressed`.

**Mobile**
- Larger menu rows and the menu toggle sits at the edge of the screen.
- The page container's gutters scale with screen width.

**Tradeoffs and risks**
- Default buttons are 4px taller than before, so dense rows grow slightly.
- Posters no longer show the AniList dominant-colour placeholder while loading.

**Files**
`src/components/ui/*` (button, badge, card, input, progress, skeleton, toast; new: select, chip, segmented, notice, section-header, stat), `src/components/{StateMessage,EpisodeStrip,EpisodeTypeBadge,FillerAvailabilityBadge,Poster,AnimeCard}.tsx`, `src/components/layout/{AppLayout,Logo,PageFallback}.tsx`, `src/features/search/SearchBox.tsx`, `src/index.css`, `src/pages/*` (container class only)
