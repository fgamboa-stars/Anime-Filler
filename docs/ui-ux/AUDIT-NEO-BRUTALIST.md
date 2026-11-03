# UI/UX audit, round 2: premium neo-brutalist direction

**Scope.** This audit covers the `ui-ux-improvements` branch at commit `9e22218`, after the first modernization round (grayscale tokens, light/dark themes, component kit, donut chart). The bar is the new brief: premium neo-brutalism, meaning Linear/Stripe/Vercel polish combined with bold type, thick borders and geometric layout, with charts at the level of the Perk report reference.

**Method.**
- Read every page, component and token file.
- Full-page screenshots of every route in both themes at 1440px and 390px.
- Measured border and surface contrast.
- The Lighthouse and interaction-sweep results from round 1 are the baseline.

The app has no modals, maps or data tables, so those brief items don't apply. The watch-order range lists are the closest thing to a table and are reviewed as one.

## Scores (current branch)

| Area | Score | Summary |
|---|---|---|
| **Overall** | **7.5 / 10** | Clean, accessible and consistent, but soft. It reads as "premium minimal", not "neo-brutalist". |
| Visual design | 7 | Refined type and colour discipline. Structure depends on blurred shadows and hairlines that almost disappear, and nothing is bold except the home headline. |
| Accessibility | 8.5 | AA text tokens everywhere and Lighthouse a11y at 100. Gaps: the donut's centre swap is hover/tap only (no keyboard), some 36px targets, and borders on cards fall below 1.5:1. |
| Mobile experience | 7.5 | The Filters disclosure and two-line titles work well. The hero actions wrap to three rows, the guide tabs and Share wrap, and the donut plus legend is about 900px tall on a phone. |
| Consistency | 8 | One token set and one component kit. The same "link pill" class string is copied into four files, there are two percentage formatters, and episode strips are framed differently in four places. |
| Information hierarchy | 7 | The home page is strong. On the anime page the core task (the episode list) starts about 1,700px down on desktop, and every section is the same rounded card, so nothing leads. |

## Measured problems

| Pair | Ratio | Note |
|---|---|---|
| Card hairline `#e6e6e6` on page `#fafafa` | 1.20 : 1 | Card edges barely exist in light mode |
| Card hairline `#1f1f1f` on surface `#0a0a0a` | 1.20 : 1 | Same in dark mode |
| Surface `#0a0a0a` on page `#000000` | 1.06 : 1 | Dark elevation is effectively invisible |

Decorative borders don't have to meet 3:1. But because the brief asks for strong structure and clean surface separation, relying on them is the main visual weakness.

## Top 10 UX/UI issues

1. **Soft structure.** Cards are separated by roughly 1.2:1 hairlines and blurred shadows. Nothing has the thick, geometric edge the brief asks for, and in dark mode surfaces merge into the page.
2. **Restrained type.** Weights top out at 650. Section headings (26–36px) sit close to body size, and key numbers (filler %, counts, time saved) aren't treated as headline figures.
3. **Card monotony.** Facts, chart, progress, filters, list, watch order and arcs all use the same card with the same radius and shadow. That is the "SaaS card kit" pattern, and nothing signals what matters most.
4. **Interactive and static cards look alike.** Guide cards (whole-card links) and information cards are identical at rest; only hover reveals which one is clickable.
5. **Weak button affordance.** Outline buttons have a hairline border that blends into cards, and the pressed state is a 2% scale that is hard to notice.
6. **Chart legends don't encode magnitude.** Shares are text only, so close values (12.8% vs 8%) take reading rather than seeing. The donut's centre swap can't be reached by keyboard.
7. **Rankings use the wrong chart.** Discover ranks series by filler %, but each row shows a full episode strip whose width carries no rank. A ranked bar would make the order visible.
8. **The core task sits low on the anime page.** Hero, facts card, chart card, progress card and tabs all come before the first episode. The facts card alone costs about 140px.
9. **Mobile density.**
   - The hero quick actions wrap to three rows.
   - The donut's legend descriptions double each row's height.
   - Long-running series lists need a lot of scrolling before "Show more".
10. **Duplicated patterns.**
    - Link-pill styling is copied into four files.
    - `fillerPercentage` and `formatShare` round differently.
    - Episode strips are framed four ways.
    - Progress is drawn two ways.

## Modernization opportunities

- **Edges, not blur.** Give structure 2px ink edges with hard offset shadows, which is the neo-brutalist signature. Make the shadow mean something: only interactive surfaces cast one, and pressing a control physically moves it into its shadow.
- **Oversized numbers.** Promote the key figures to a KPI style (heavy weight, tight tracking, tabular figures), so each page leads with its number the way the Perk report does.
- **Two card tiers.** *Panels* (static, edged, no shadow) and *tiles* (interactive, edged, hard shadow that grows on hover).
- **Charts as editorial figures.**
  - Donut: a heavier centre KPI and a hover lift on slices. Legend rows get share bars and become keyboard-operable buttons.
  - Discover: ranked bars instead of strips.
  - Strips: one framed style everywhere.
- **Tighter anime page.** Fold the facts into the hero as a compact definition row, so the chart and list move up.
- **Shared primitives** for repeated patterns: `TextLink` pills, one `formatShare`, one `Meter` (progress) style.

## Design-system recommendations

| Token / rule | Proposal |
|---|---|
| Border widths | `1px` hairline for dividers inside a panel; `2px` edge for every panel, tile, control and chart frame |
| `--edge` | New structural edge colour. Light: ink `#171717`. Dark: `#3d3d3d`, kept below text contrast so dark mode stays comfortable. |
| Hard shadows | `--shadow-hard-sm` (2px), `--shadow-hard` (4px), `--shadow-hard-lg` (6px), offset down-right with no blur. Light: ink. Dark: `#2e2e2e`/`#3a3a3a` on black. |
| Press physics | Interactive tiles and buttons translate by the shadow offset on `:active`, and the shadow collapses to 0. Disabled when reduced motion is on. |
| Radius | Tighten to geometric: panels and tiles 16px, controls 10px, chips and toggles full pill, data marks 4px |
| Type | Weights up to 800. Display up to 112px, title up to 72px, heading 32–44px, a new `text-kpi` figure style. No all-caps labels |
| Surfaces | Dark surface raised to `#0f0f0f` and surface-2 to `#181818`, so panels separate from the black page |
| Focus | Keep the 2px ring with 2px offset. Thick edges must never replace the focus ring. |

## Prioritized roadmap

| Priority | Work | Why first |
|---|---|---|
| P0 | Edge and shadow tokens, heavier type scale, two card tiers, button/field/chip press physics | Everything else inherits it |
| P1 | Charts: donut legend bars, keyboard focus, hover lift, centre KPI; ranked bars on Discover; framed strips; bordered meter | The brief's special focus, and issues 6 and 7 |
| P2 | Anime page hierarchy: facts folded into the hero, KPI header on the chart panel | Issue 8 |
| P3 | Home, Discover, Search, Progress, 404 and error restyle with oversized type; mobile hero actions in one row | Issues 2, 3, 9 |
| P4 | De-duplicate link pills, formatters and strip framing | Issue 10 |
| P5 | Verify: tests, contrast, Lighthouse in both themes, interaction sweep, screenshots, docs | Approval gate |

## Design-system strategy

The token-first approach from round 1 stays. Neo-brutalism is added as tokens and two utilities (`panel`, `tile`), not as one-off classes, so a later change of direction is a token edit. Components keep their APIs, so no business logic or props callers rely on change.

## Dark/light-mode strategy

The two themes are designed separately, not inverted.

- **Light mode** is the purest neo-brutalist expression: white panels, ink edges and ink shadows on `#f5f5f4`.
- **Dark mode** keeps the structure but lowers the voltage: rich-black page, `#0f0f0f` panels, `#3d3d3d` edges and charcoal hard shadows. White hard shadows on black would vibrate and tire the eye.

The theme switcher, no-flash script and persistence are unchanged.

## Accessibility strategy

- All text tokens stay at 4.5:1 or above, and control boundaries at 3:1 or above. Every changed pair is re-measured.
- Thick edges help Windows High Contrast and forced-colors users, because borders survive when shadows and backgrounds are removed.
- **Charts.**
  - Legend rows become buttons with `aria-pressed`, so the centre KPI works by keyboard.
  - The SVG keeps its full text summary, and legend values remain the table view.
  - Status and type are never shown by colour alone.
- **Targets.** Primary controls stay at 44px or more. Secondary controls are at least 36px with 24px spacing.
- **Reduced motion.** Press translation, chart animation and hover lifts are all turned off.

## Chart modernization strategy

1. **Donut** (the Perk reference):
   - Rounded, gapped segments (already in place).
   - A heavier centre KPI with its label.
   - Slices lift outward slightly on focus or hover; other slices dim.
   - Legend rows show a share bar, value and count, are keyboard-operable, and drop descriptions on phones.
   - Sizing adapts to the container.
2. **Ranked bars** (Discover "Most / Least filler"): one horizontal bar per series on a shared 0–100% scale, in the filler hue, with the value labelled at the bar end. The order is visible before anything is read.
3. **Episode strips** (guide cards, arcs, watch order): one framed style, with a 2px edge, 6px radius and 2px surface gaps between runs where they fit.
4. **Meters** (watch progress): a 2px-edged track with ink fill and a heavy figure beside it.
5. **Validation:** the episode-type palette was re-run through the colour-vision validator in round 1 and passes for adjacent slices in both themes. It is unchanged here.
