# Architecture

Anime Filler Finder is a static single-page app. Everything happens in the browser; there is no server, database or account system. This keeps hosting at $0 and the codebase small.

## Two separate data systems

| | AniList (remote) | Filler datasets (local) |
| --- | --- | --- |
| Provides | Titles, description, genres, studios, score, popularity, status, episode count, season, dates, cover and banner images | Per-episode classification (CANON, MIXED, ANIME_CANON, FILLER), episode titles, arcs |
| Coverage | Every anime on AniList | Only anime that have been imported (11 series as of this writing) |
| Where | `https://graphql.anilist.co` (`VITE_ANILIST_API`) | `src/data/anime/<slug>.json` |
| Loaded | On demand, cached | Lazily, one chunk per anime |

The two are joined by the **AniList Media ID**. Each dataset stores `anilistId`, and the catalog (`src/data/index.json`) maps IDs to slugs, so the same show never exists twice. A dataset can never claim an ID another dataset already uses (the importer and `data:validate` both refuse).

```
            ┌─────────────── AniList GraphQL ───────────────┐
 search ───►│ Page.media(search)   Media(id)   Page(sort)   │
            └───────────────┬───────────────────────────────┘
                            │ MediaSummary / MediaDetail (cached)
                            ▼
 /anime/:id ──► resolve id ──► catalog lookup by slug or AniList ID
                            │
              has dataset? ─┼─ yes ─► load src/data/anime/<slug>.json (lazy chunk)
                            │          → episodes, arcs, filters, watch order, progress
                            └─ no ──► show AniList details + "filler data not available"
```

## Routing

| Route | Page |
| --- | --- |
| `/` | Home: search, quick actions, continue watching, featured guides |
| `/search?q=` | Full search results |
| `/anime/:id` | Detail page. `:id` is a dataset slug (`naruto`) or `<anilistId>-<title>` (`16498-attack-on-titan`). A numeric ID that has a dataset redirects to the slug, keeping the query string |
| `/discover` | Most/least filler and highest rated |
| `/progress` | Everything you are watching |

Pages are lazy-loaded except the home page.

### URL state

The anime page keeps all view state in the query string, which is the single source of truth:

| Param | Example | Meaning |
| --- | --- | --- |
| `view` | `watch-order`, `arcs` | Tab (default: episodes) |
| `type` | `filler`, `canon,mixed` | Episode types to show |
| `arc` | `chunin-exams` | Arc slug |
| `q` | `rasengan`, `136` | Title text or exact episode number |
| `watched` | `unwatched`, `watched` | Watched filter |
| `sort` | `desc` | Newest first |
| `#ep-N` | `#ep-136` | Scroll to an episode |

`useEpisodeFilters` parses and writes these. Each change is a real history entry (back/forward work); typing in the episode search replaces the entry so history isn't flooded. Invalid values are ignored rather than causing errors. The last filters per anime are also mirrored into the preferences store.

## AniList client (`src/services/anilist.ts`)

- **Queries**: `searchAnime`, `getAnimeDetail`, `getAnimeByIds`, `getTopRated`. Adult titles are excluded.
- **Caching**: `src/services/cache.ts` keeps results in memory and `localStorage` with a TTL (6 h for searches, 12 h for details, 24 h for rankings) and prunes old entries. Repeat visits usually make no requests.
- **De-duplication**: concurrent calls with the same cache key share one request. Shared requests finish even if the component that started them unmounts, so the result still lands in the cache.
- **Rate limits**: AniList allows roughly 30 requests per minute. On HTTP 429 the client records `Retry-After` globally so every caller backs off together; short waits are retried automatically, long ones surface a clear "try again in N seconds" message.
- **Failures**: network errors and 5xx responses retry with exponential backoff, then become typed `AniListError`s (`rate-limit`, `network`, `not-found`, `server`, `bad-response`) that the UI turns into actionable messages with a retry button.
- **Resilience**: if AniList is unreachable, dataset pages still work using the title from the local catalog, and search still finds local datasets.

## Search (`src/features/search`)

AniList's search is not typo-tolerant ("blech" returns nothing). The app layers Fuse.js on top:

1. Query AniList with the debounced input.
2. If AniList returns nothing, ask Fuse for the closest title in a small pool (local dataset titles and a ~90-title popular list in `src/data/popular-titles.json`) and search AniList again with the correction. The UI says which title it used.
3. Merge in local datasets that match, then re-rank everything with Fuse (word-by-word matching, so "attak titan" matches "Attack on Titan"; prefix boosts, so "shipp" ranks Naruto Shippuden first). Unmatched AniList results keep their order after the fuzzy matches.
4. Matched character ranges drive the title highlighting.

Fuse only ever runs on these small in-memory lists. Nothing large is preloaded. The header search box only queries AniList while its suggestion list is open.

## Filler datasets

```
src/data/
├── index.json                  catalog: one summary per dataset (counts, filler %, arcs)
├── anime/
│   ├── naruto.json             full dataset
│   └── naruto-shippuden.json
└── popular-titles.json         typo-correction pool for search
```

`src/services/datasets.ts` uses `import.meta.glob('../data/anime/*.json')`, so every dataset file becomes its own lazily loaded chunk with no registration code. The catalog is small and bundled, which lets the home and discover pages show filler percentages without downloading episode lists. Each catalog entry also carries a run-length encoded `strip` (for example `C25F1M3`), so those pages can draw every series' episode strip without loading its dataset.

Vitest's on-disk module cache is turned off (`fsModuleCache: false`) because it would otherwise keep a stale `import.meta.glob` result after new datasets are imported.

At runtime `prepareDataset` (in `src/utils/dataset.ts`) sorts episodes, derives arc slugs and arc ranges, and counts types. The same module is used by the Node import scripts, so the app and the tooling can't disagree.

Dataset schema (`FillerDataset` in `src/types`):

```jsonc
{
  "schemaVersion": 1,
  "slug": "naruto",
  "anilistId": 20,
  "title": "Naruto",
  "alternativeTitles": ["NARUTO", "ナルト"],
  "totalEpisodes": 220,
  "source": "…",
  "updatedAt": "2026-11-02T01:23:55.471Z",
  "episodes": [{ "number": 1, "title": "Enter: Naruto Uzumaki!", "type": "CANON", "arc": "Prologue: Land of Waves" }]
}
```

Datasets are written one episode per line so pull-request diffs stay readable.

## State (`src/store`)

| Store | Persisted key | Contents |
| --- | --- | --- |
| `useProgressStore` | `aff:progress` | Watched episode numbers per anime, last watched, title and episode count (so "continue watching" works without loading datasets) |
| `usePreferencesStore` | `aff:preferences` | Hide episode titles, watch-order defaults (include mixed / anime canon), last filters per anime |

Filter state itself lives in the URL, not the store.

## Watch order

`generateWatchOrder` splits episodes into WATCH (canon, plus mixed and anime canon unless switched off) and SKIP, then collapses each into contiguous ranges. It's pure and runs instantly even for 500 episodes. The panel can scope it to one arc via the `arc` param.

## Performance

- Route-level code splitting; vendor chunks for React/router and Fuse.
- Datasets load only on their page (Shippuden is ~8 KB gzipped).
- Episode rows are memoized, rendered in pages of 150 with `content-visibility: auto`.
- Cover images have fixed dimensions, lazy loading and `fetchpriority` for the hero poster.
- Fonts are self-hosted variable fonts (no third-party font requests).

## Accessibility

Semantic landmarks and headings, a skip link, an ARIA combobox for search autocomplete (arrow keys, Enter, Escape), `aria-pressed` filter chips, labelled form controls, a live region for result counts and toasts, visible focus rings, text alternatives for the episode strip, and reduced-motion support.

## Testing

`npm test` runs Vitest with jsdom:

| Area | File |
| --- | --- |
| Search ranking and typo correction | `src/features/search/searchEngine.test.ts` |
| Filters and URL parsing | `src/features/episodes/filterEpisodes.test.ts` |
| URL persistence, back/forward | `src/features/episodes/useEpisodeFilters.test.tsx` |
| Watch progress | `src/store/progressStore.test.ts` |
| Watch order generator | `src/features/watch-order/generateWatchOrder.test.ts` |
| CSV import utility and shipped datasets | `scripts/lib/importer.test.ts` |
| Pages against a mocked AniList | `src/test/pages.test.tsx` |
