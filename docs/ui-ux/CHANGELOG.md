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
