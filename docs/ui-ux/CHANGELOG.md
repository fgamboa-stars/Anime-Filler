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

---

## 3. Pages: home, anime guide, watch order, arcs, discover, search, progress, 404 and error

**What changed**
- **Home.**
  - Editorial hero with a 44–84px display headline, a lead paragraph, a 64px search field and outline quick actions.
  - The Naruto Shippuden showcase is now a card. It has the series title, a large filler percentage, the strip with episode-number axis labels, and the legend.
  - Guide cards are 24px-radius surfaces with hover elevation. Long season lists collapse to two links plus "+N more", so every card in a row has a similar height.
  - The coverage section uses title-size type in two columns.
- **Anime page.**
  - The hero banner is desaturated and softened. The title is set at up to 64px with tight tracking, genres are neutral chips, and the facts sit in a card.
  - New "Episode map" card: the strip (48–64px tall, with axis), the filler percentage and the legend.
  - Progress is its own card.
  - The guide tabs are a segmented control.
  - The "not classified yet" and "Filler data is not currently available" messages use the shared `Notice` component.
- **Episode filters.**
  - Everything now sits in one card: search, then type chips, then arc/show/sort/spoiler controls.
  - On phones, the type chips scroll sideways, and the four secondary controls sit behind a **Filters** disclosure (`aria-expanded`/`aria-controls`) with an active-filter count. This cuts the filter block from about 450px to about 150px.
- **Episode list.**
  - 64px minimum row height and a hover tint.
  - Grayscale checkboxes: watched means "done", not "canon".
  - A slim rounded type stripe on each row.
  - On phones, titles wrap to two lines and the type badge shows its icon only. The label stays for screen readers.
- **Watch order.** Stats, the strip and the include-options sit in one card, with 44px checkbox rows. The Watch and Skip columns are cards with tinted range chips.
- **Arcs.** Cards with 36px action links, and the filler percentage uses the AA text tokens.
- **Discover, Search, Progress, 404 and error page.**
  - Consistent page header: `text-title` h1 with a lead paragraph.
  - 64px top spacing.
  - Ranking cards with divided rows.
  - Wider poster-grid gutters.
  - The error detail is shown in a monospace well.

**Why it helps usability**
- The episode list now starts in the first screen on phones.
- Each page reads in one order: hero, overview, progress, then the active section.
- Collapsing season lists stops one series from dominating the home grid.

**Why it helps visual quality**
- Strong type contrast between display, title, heading and body.
- Generous section spacing.
- Card surfaces group related information without heavy borders.
- The one saturated element on each page is the data.

**Accessibility**
- The disclosure and segmented controls expose state.
- Compact badges keep their text label for assistive tech.
- All new text colours meet AA in both themes.
- Interactive rows, links and checkboxes meet the 24px minimum target size, and primary controls meet 44px.
- Two new tests cover the theme switcher's semantics and persistence.

**Mobile**
- Filter disclosure, scrolling chips, two-line titles, icon-only badges, and edge-to-edge scrolling season navigation.

**Tradeoffs and risks**
- On phones, arc and watched filters are one tap further away. The Filters button shows a count when any of them is active.
- Compact badges rely on the icon plus colour plus stripe below 640px.

**Files**
`src/pages/{HomePage,AnimePage,DiscoverPage,SearchPage,ProgressPage,NotFoundPage,RouteErrorPage}.tsx`, `src/features/anime/AnimeHero.tsx`, `src/features/episodes/{EpisodeFilters,EpisodeList}.tsx`, `src/features/watch-order/WatchOrderPanel.tsx`, `src/features/arcs/ArcList.tsx`, `src/features/progress/{ProgressSummary,ContinueWatching}.tsx`, `src/components/EpisodeTypeBadge.tsx`, `src/components/ThemeSwitcher.test.tsx` (new), `src/index.css` (dark data colours)

---

## 4. Donut chart replaces the long episode strip

**What changed**
- **New `EpisodeDonut` component:**
  - A thick ring with one rounded segment per episode type and gaps between segments, modelled on the reference chart.
  - The filler share is shown large in the centre.
  - A legend beside it lists each type's description, share and count.
  - Hovering or tapping a slice, or hovering a legend row, dims the other slices and puts that type's share in the centre.
  - Segments animate in once, and the animation is skipped with reduced motion.
- **Anime page.** The "Episode map" strip is replaced by a card headed "N of M episodes are filler" with the donut.
- **Home page.** The showcase strip is replaced by "40.6% of the show is filler you can skip" with the donut.
- **Kept as strips:** the small strips in guide cards, Discover rankings, arc cards and watch order still show where filler falls in broadcast order.
- **Palette re-validated** with the dataviz colour-vision checker, since pie slices sit next to each other:
  - Light mode: mixed changed #d97706 → #c27c0e.
  - Dark mode: canon changed #10b981 → #10a37a, and mixed changed #f59e0b → #bf8a0f.
  - Every adjacent slice pair now passes both checks in both themes.

**Why it helps usability**
- "How much of this is filler?" is answered at a glance, with exact numbers right beside the chart.

**Why it helps visual quality**
- One bold, centred figure per page in the style of the reference, instead of a busy 500-band bar.

**Accessibility**
- The SVG has `role="img"` with a full text summary.
- The legend is a `dl` that works as the table view, so colour is never the only cue.
- Labels use text tokens. Slice colours meet 3:1 against the surface.

**Mobile**
- The chart stacks above the legend, and slices respond to taps.

**Tradeoffs and risks**
- The anime page no longer shows *where* filler sits in broadcast order at the top. The Arcs tab still shows that per arc.
- Watched progress no longer overlays the chart; the progress card shows it.
- Slices under 1.2% are slightly exaggerated so they stay visible. The legend shows exact values.

**Files**
`src/components/EpisodeDonut.tsx` (new), `src/components/EpisodeDonut.test.tsx` (new), `src/pages/AnimePage.tsx`, `src/pages/HomePage.tsx`, `src/index.css`, `docs/ui-ux/DESIGN_SYSTEM.md`

---

## 5. Neo-brutalist foundation: edges, hard shadows, heavier type

**What changed**
- **New tokens.**
  - `--edge` is the 2px structural border colour: ink `#171717` in light mode, `#454545` in dark.
  - `--hard` is the unblurred offset-shadow colour: ink in light mode, `#2e2e2e` in dark.
  - The light page is now `#f4f4f4` so white panels stand out.
  - Dark surfaces are lifted to `#0f0f0f`, `#181818` and `#222222` so panels separate from the black page.
  - Radii are tightened to 6/10/16/20/24.
- **Two surface tiers.**
  - `panel` is for static content: 2px edge, 16px radius, no shadow.
  - `tile` is for interactive surfaces: it adds a 4px hard shadow, lifts to 6px on hover or keyboard focus, and sinks into its shadow when pressed.
  - The old `surface-card` now maps to `panel`. Guide cards, continue-watching cards, and poster cards in search and Discover use the tile style.
- **Type.**
  - Display: 48–112px at weight 800.
  - Title: 40–72px at 800.
  - Heading: 30–44px at 750.
  - Subheading: 20px at 700.
  - New `text-kpi` style for headline figures.
  - Episode numbers and the wordmark are set heavier.
- **Controls.**
  - Buttons are 10px-radius rectangles with 2px edges and a 2px hard shadow. They lift by 1px on hover and press into the shadow.
  - Fields and selects have 2px borders and gain a hard shadow on focus. The hero search is an edged control with a 4px shadow.
  - Chips have 2px borders, and pressed chips are filled ink.
  - The segmented control and theme switcher use an ink fill for the active option.
  - Badges have 1.5px borders at a higher tint.
  - Notices have 2px tone borders.
  - Progress is a 14px edged meter with an ink fill.
  - Toasts are edged, with a hard shadow.
- **Shell.**
  - 2px header and footer rules.
  - The active nav item is an edged box.
  - The mobile menu toggle is an edged square, and the active mobile nav row is filled ink.
  - The footer sits on a white panel.

**Why it helps usability**
- Clickable things now look clickable at rest, because only tiles and buttons cast a shadow.
- Pressing gives physical feedback.
- Edges show where each group starts and ends without relying on shadows.

**Why it helps visual quality**
- It delivers the brief's neo-brutalist signature (thick borders, hard shadows, heavy type) while staying grayscale and calm. Colour remains reserved for data and status.

**Accessibility**
- Text tokens were re-checked on the new surfaces: 52 of 52 pairs pass.
- Field borders stay at ≥3:1 (3.6:1 in dark mode).
- Edges survive forced-colours mode, where shadows disappear.
- Press and hover movement is turned off under reduced motion.
- Focus rings are unchanged.

**Mobile**
- The menu toggle is a 44px edged target.
- Mobile nav rows are 48px with larger text.

**Tradeoffs and risks**
- In light mode the ink edges are deliberately strong; this is the intended look, not a bug.
- Dark mode uses charcoal shadows rather than white ones, so the depth effect is quieter there by design.

**Files**
`src/index.css`, `src/components/ui/{button,input,chip,segmented,badge,notice,progress,toast,card,stat,skeleton}.tsx`, `src/components/{ThemeSwitcher,Poster,AnimeCard}.tsx`, `src/components/layout/{AppLayout,Logo}.tsx`, `src/features/search/SearchBox.tsx`, `src/features/episodes/{EpisodeFilters,EpisodeList}.tsx`, `src/features/progress/ContinueWatching.tsx`, `src/features/anime/AnimeHero.tsx`, `src/pages/{HomePage,AnimePage,RouteErrorPage}.tsx`

**Components affected**
Button, Input, Select, ToggleChip, Segmented, Badge, Notice, Progress, Toast, Card, Stat, Skeleton, ThemeSwitcher, Poster, AnimeCard, AppLayout, Logo, SearchBox, EpisodeFilters, EpisodeList, ContinueWatching, AnimeHero, GuideCard

---

## 6. Chart modernization

**What changed**
- **Donut (`EpisodeDonut`).**
  - Heavier centre figure (weight 800, tight tracking) with a colour swatch next to its label.
  - On hover, focus or selection, the active slice moves 4px outward along its angle and the other slices dim.
  - Each legend row is now a button. Hover or keyboard focus previews that type in the centre, and click or Enter pins it (`aria-pressed`).
  - Each legend row has a share bar on a 0–100% scale, so magnitude can be seen as well as read.
  - Values are set in heavy tabular figures.
  - Descriptions hide on phones to keep the legend short.
- **Ranked bars (Discover).** The episode strips in the "Most filler" and "Least filler" panels are replaced by an edged bar on a shared 0–100% scale, using the filler colour. The value is printed beside each bar, and rank numbers are larger and heavier.
- **Episode strips.** One framed style everywhere: a 2px edge with 1px surface gaps between runs. Large strips are 56–72px tall with an 8px radius; small strips are 14px with a 6px radius.
- **Watch order.** KPI figures (to watch, to skip, hours saved) use the heavier `Stat`. Range chips have stronger 1.5px tinted borders, and the column markers are square swatches.
- **Progress.** The watched count is a 30–36px heavy figure next to the edged meter.
- **New `ShareBar` primitive:** a horizontal 0–100% bar, either framed or plain. It is hidden from assistive tech because its value is always printed beside it.

**Why it helps usability**
- Close values (12.8% vs 8%) can now be compared at a glance.
- Rankings show their order visually.
- Every chart interaction can be done by keyboard.

**Why it helps visual quality**
- The charts read like presentation slides: a bold KPI, consistent framing, rounded marks with surface gaps, and restrained motion. This follows the fintech/analytics references while staying grayscale.

**Accessibility**
- The legend buttons have state and readable names (type, percentage, episode count).
- The SVG keeps its full summary.
- Bars are decorative duplicates of printed values.
- Slice colours are unchanged and still pass the colour-vision validator in both themes.
- Motion stops under reduced motion.

**Mobile**
- Legend descriptions are hidden below 640px.
- Bars and strips stretch to the container width.

**Tradeoffs and risks**
- Discover no longer shows each series' episode strip. The strip is still on every guide card and anime page.

**Files**
`src/components/EpisodeDonut.tsx`, `src/components/EpisodeDonut.test.tsx`, `src/components/ui/share-bar.tsx` (new), `src/components/EpisodeStrip.tsx`, `src/pages/DiscoverPage.tsx`, `src/features/watch-order/WatchOrderPanel.tsx`, `src/features/progress/ProgressSummary.tsx`

**Components affected**
EpisodeDonut, ShareBar, EpisodeStrip, FillerRanking, WatchOrderPanel, ProgressSummary, Stat

---

## 7. Page hierarchy and shared patterns

**What changed**
- **Anime page.** The facts card ("Format / Status / Episodes…") is now a compact row inside the hero between two 2px rules, with bold values. This removes a full panel and moves the chart and episode list up the page.
- **Home.** The hero quick actions wrap into at most two rows on phones (previously three), with slightly more spacing.
- **New `link-pill` utility.** One definition replaces the secondary-link styling that was copied six times across guide cards and arc cards: 36px hit area, weight 600, and a 2px underline on hover.
- **Inherited by every page** (Discover, Search, Progress, 404, error) from the foundation tokens: titles at weight 800, edged panels, edged buttons.

**Why it helps usability**
- The core task (episode list, filters) starts higher on the anime page.
- The secondary links in guide cards and arc cards now look and behave identically.

**Why it helps visual quality**
- Thick rules frame the facts the way a report's data line does, with less card-on-card repetition.

**Accessibility**
- Unchanged semantics: the facts remain a `dl`, and links keep their names and 36px targets.

**Mobile**
- Hero actions take one fewer row.
- The facts row is a two-column grid on phones.

**Files**
`src/features/anime/AnimeHero.tsx`, `src/pages/HomePage.tsx`, `src/features/arcs/ArcList.tsx`, `src/index.css`

**Components affected**
AnimeHero, GuideCard, ArcList, the home hero

---

## 8. Verification fixes

**What changed**
- Episode-type badge tints are now mixed against the surface colour, not made transparent. Previously a canon badge on the light `#f4f4f4` page dropped to 4.45:1 (Lighthouse flagged it on Discover). It now measures the same on every background.
- Added a visually hidden "Results" heading on the search page, so poster-card `h3`s no longer skip a heading level.
- Updated `DESIGN_SYSTEM.md` for round 2.

**Results**

Lighthouse (mobile):

| Route | Theme | Performance | Accessibility, best practices, SEO |
|---|---|---|---|
| Home | Light | 97 | 100 |
| Home | Dark | 97 | 100 |
| Anime page | Light | 94 | 100 |
| Anime page | Dark | 94 | 100 |
| Discover | Light | 96 | 100 |
| Discover | Dark | 96 | 100 |
| Search | Light and dark | not measured | Accessibility 100 |

- CLS is at most 0.001.
- 120 unit tests pass.
- The 32-step interaction sweep has no failures.
- The CSS bundle is 60.3 kB raw, up from 58.0 kB.

**Files**
`src/components/ui/badge.tsx`, `src/pages/SearchPage.tsx`, `docs/ui-ux/DESIGN_SYSTEM.md`

---

## 9. Retro-brutalist direction (from the "Brutalist Web Elements" reference)

The previous neo-brutalist version is saved as the local git tag `neo-brutalist-v1`, at commit `09384fe`. Its Vercel preview deployment stays reachable. Pushing the tag itself was refused by the git proxy.

**What changed**
- **Type.**
  - Archivo Black for every heading and headline figure, set in uppercase (it replaces Geist).
  - Space Mono for all body text, controls and labels.
  - New `text-label` style (mono, caps, wide tracking) for window titles and meta lines.
- **Geometry.** Every corner is square: all radius tokens are 0, and per-component rounding was removed.
- **Colour.**
  - Paper `#e9e9e6` and ink `#0a0a0a` in light mode; `#0b0b0b` and off-white `#ecebe6` in dark mode.
  - One acid-lime accent (`--lime`), used only for the "Filler data available" sticker-badge, hover highlights, text selection and the starburst.
  - Episode-type colours are unchanged.
  - Light-mode mixed text was darkened to `#92400e` so it passes on the darker paper.
- **Windows.** A new `Window` component adds a black title bar with a file-name caption (e.g. `naruto-shippuden.stats`, `filters.cfg`, `episodes.txt`, `progress.sav`) and inert window controls. It is used for:
  - the donut chart (home and anime page)
  - filters
  - the episode list
  - progress
  - watch order and its Watch/Skip lists
  - the Discover rankings
  - every status or error message, titled `system`, with a pixel warning icon
  - Windows cast a 4px hard shadow.
- **Controls.**
  - Buttons are mono caps with a 3px hard shadow that presses flat.
  - Outline and secondary buttons echo the reference's PUBLISH/CANCEL pair.
  - Select menus have a solid black caret block, like the reference's "File ▼" menu.
  - The search field has its magnifier in a separate bordered cell.
  - Chips and tabs are mono caps; unselected chips turn lime on hover.
  - Focus outlines are dashed, a retro cue that stays highly visible.
- **Reset progress.** The single "Confirm reset" button is now an inline system prompt: a pixel warning icon, the question "Reset all progress for this series? This can't be undone." and **Confirm reset** / **Cancel** buttons, with Escape to dismiss. It is announced as an `alertdialog`.
- **Home.**
  - 4-line uppercase display headline.
  - A slash meta line ("Search / Filter / Watch order / Track progress").
  - A black stat box on desktop (series count and episodes classified).
  - A lime "No sign-up" starburst sticker.
- **Footer.** A decorative barcode ("Watch the story") and a mono caps baseline strip.
- **Details.**
  - Pixel-art arrow and hand cursors.
  - Chunky square scrollbars.
  - A pixel hourglass on the loading screen.
  - A pixel smiley on the empty progress page.

**Why it helps usability**
- Everything you can act on (buttons, chips, selects, search) has the same heavy, pressable look, and status messages all share one recognisable dialog form.
- Reset now asks a clear question and offers an explicit Cancel; before, the confirmation disappeared as soon as focus moved.

**Why it helps visual quality**
- It gives the product a distinct, memorable identity drawn from the reference: windows, stickers, cursors, barcode and mono type. Data colour stays the only saturated element apart from the single lime accent.

**Accessibility**
- 62 text, control and data colour pairs were re-checked; all pass in both themes after the mixed-text fix.
- Window title bars, stickers, barcode and pixel icons are hidden from assistive tech.
- Uppercase is CSS-only, so screen readers and accessible names keep sentence case.
- Pixel cursors fall back to the system cursor, and text fields keep the text cursor.
- Lighthouse accessibility is 100 on every page tested, in both themes.

**Mobile**
- Windows stack full-width.
- The stat box and sticker hide on small screens; the headline, meta line and search stay.
- Menu items use the display face at 48px row height.

**Performance**
- Two static font files (Archivo Black 400, Space Mono 400/700) replace the variable Geist font.
- Lighthouse performance (mobile): 92–96 on home, anime and Discover.
- On the search page, fixed a layout shift (0.62 → under 0.1) by always reserving the results-count line. The small shift that remains comes from AniList results replacing local matches.

**Tradeoffs and risks**
- Monospace body text is less efficient to read in long paragraphs; descriptions are capped at about 68 characters per line to compensate.
- The heavy uppercase display face makes long anime titles wrap to more lines.
- Pixel cursors are decoration and can be removed by deleting one CSS block.

**Files**
`src/index.css`, `package.json`, `package-lock.json`, `src/components/retro/{Window,PixelIcon,Barcode,Starburst}.tsx` (new), `src/components/ui/*`, `src/components/{StateMessage,FillerAvailabilityBadge,EpisodeDonut,Highlight,Poster,AnimeCard,EpisodeStrip,ThemeSwitcher}.tsx`, `src/components/layout/{AppLayout,Logo,PageFallback}.tsx`, `src/features/**/*.tsx`, `src/pages/*.tsx`

**Components affected**
Window (new), PixelIcon (new), Barcode (new), Starburst (new), every UI primitive, StateMessage, ProgressSummary, EpisodeFilters, EpisodeList, WatchOrderPanel, FillerRanking, EpisodeDonut, AnimeHero, AppLayout, HomePage

---

## 10. Home page: red sticker, centred search, guide filter

**What changed**
- **Sticker.** The "No sign-up" starburst now uses the site's filler red (`--filler`) with white text and an ink outline, instead of lime. The text is 20px heavy, which counts as large text for contrast purposes.
- **Showcase removed.** The Naruto Shippuden stats window (donut chart and legend) is gone from the home page. The donut still appears on every anime page.
- **Centred search.** The AniList search is now centred on the page under a "Search every anime on AniList" label, and the quick-action buttons are centred beneath it.
- **New guide filter.** A `guides.idx` window above the "Full filler guides" grid filters the 21 series on the page, separately from the AniList search.
  - It matches series titles, season titles and season labels, ignoring case and punctuation.
  - A live "N of 21 series" count is shown, and there is a clear button.
  - If nothing matches, a system message offers **Clear search** or **Search all of AniList** for that term.

**Why it helps usability**
- Searching every anime and narrowing the on-page list are two different jobs, so they now have separate, clearly labelled places.
- The home page reaches the guide list much sooner.

**Why it helps visual quality**
- The hero now reads as a single centred column with the search as its focal point.
- The red sticker ties the hero to the data colours rather than adding a second accent.

**Accessibility**
- The guide filter has a visible label and a polite live count.
- The clear button is labelled "Clear guide filter".
- White on `#dc2626` measures 4.83:1, and on the dark-mode `#ef4444` it is 3.76:1, which passes for large text.

**Mobile**
- The search and buttons centre in a single column.
- The filter window stacks its label, field and count.

**Tests**
- New page test: filtering to "dragon ball" shows only Dragon Ball series and the matching count. A term with no matches shows the empty message, and **Clear search** resets the field.

**Files**
`src/pages/HomePage.tsx`, `src/components/retro/Starburst.tsx`, `src/test/pages.test.tsx`

**Components affected**
HomePage hero, GuideSearch (new, in HomePage), Starburst

---

## 11. Home page trims

**What changed**
- Removed the "Every anime is searchable. Filler guides are growing." section.
- Removed the `guides.idx` guide filter. The guide grid is back to a plain list, and its page test was removed. The centred AniList search stays.
- The "No sign-up" sticker text is now black on the red sticker.

**Accessibility**
- Black on `#dc2626` measures 4.10:1, and on dark-mode `#ef4444` it measures 5.26:1. The sticker text is 20px heavy (large text), so both pass.

**Files**
`src/pages/HomePage.tsx`, `src/components/retro/Starburst.tsx`, `src/test/pages.test.tsx`

---

## 12. Filler guides get their own tab

**What changed**
- **New Guides page.** The guide list is now at `/guides`, with a page title of "Filler guides" and the same series, season and episode counts and "Compare filler rankings" link. Its guide cards and featured ordering are unchanged.
- **New nav tab.** "Guides" sits between Home and Discover, in both the desktop header and the mobile menu.
- **Home page.** It now holds only the hero, the centred search and, when you have progress, Continue watching.
- **Shared ordering.** The featured-first ordering moved to `featuredGroups()` in `src/utils/franchise.ts`, so Home (for its quick actions) and Guides use the same order.
- **Loading.** The Guides page loads lazily, like the other secondary pages, so the home bundle no longer includes the guide cards.

**Why it helps usability**
- Home is a short landing page focused on search.
- Browsing the full guide list is now one tab away and has its own address you can bookmark and share.

**Accessibility**
- The guide list now has a page-level `h1`.
- The nav tab follows the existing `aria-current` pattern.
- A new page test clicks the Guides tab and checks the heading and guide cards.

**Files**
`src/pages/GuidesPage.tsx` (new), `src/pages/HomePage.tsx`, `src/utils/franchise.ts`, `src/App.tsx`, `src/components/layout/AppLayout.tsx`, `src/test/pages.test.tsx`

---

## 13. Barcode logo

**What changed**
- The logo's coloured episode bars are replaced by a small barcode in the text colour. It is ink in light mode and off-white in dark mode, matching the retro direction.
- The logo still links home, still has the accessible name ", home", and still appears in both the header and the footer.

**Files**
`src/components/layout/Logo.tsx`

---

## 14. Home intro copy

**What changed**
- Replaced the home-page intro paragraph with the owner's copy. Sentence starts are capitalized and "chose" is corrected to "choose".

**Files**
`src/pages/HomePage.tsx`
