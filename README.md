# Anime Filler Finder

**Which episodes should I watch? Which can I skip?**

Anime Filler Finder lets you search every anime on [AniList](https://anilist.co) and, for series with a filler guide, see every episode marked as canon, mixed, anime canon or filler. Build a skip-the-filler watch order, filter the episode list, track what you've watched and share any view with a link.

It runs entirely in the browser and costs **$0/month**: no backend, no database, no accounts, no paid APIs.

## Features

- **Search every anime on AniList** with autocomplete and typo tolerance (Fuse.js). "narut", "shipp", "blech" and "attak titan" all find the right show — when AniList's own search finds nothing, the app retries with a fuzzy-corrected title.
- **Anime details** from AniList: description, genres, studios, score, popularity, episode count, status, season, dates, cover and banner art.
- **Filler guides** for Naruto (220 episodes) and Naruto Shippuden (500 episodes), each episode classified and grouped into story arcs.
- **Episode filters** by type, arc, title/number, watched state and sort order.
- **URL-shareable views**: every filter lives in the query string, so refresh, bookmarks, deep links and back/forward work. "Share current view" copies the link.
- **Canon watch order generator**: WATCH and SKIP ranges, optional mixed/anime-canon episodes, per-arc scope, time saved, and "Copy watch order".
- **Watch progress** saved in `localStorage`: tick episodes, "mark up to here", completion percentage and continue watching.
- **Arc pages** with filler percentage and a canon-only link for each arc.
- **Discover**: most and least filler (from local datasets) and highest rated (AniList scores).
- **Clear coverage badges**: "Filler data available" or "Filler data coming soon". Anime without a guide still show full AniList details plus a notice.
- **Add new anime without code changes**: import a CSV and the episode list, filters, watch order, progress and arc pages appear automatically.
- Dark, responsive, keyboard-accessible UI with skeleton loaders and lazy-loaded routes.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4, shadcn/ui-style components (Radix Slot, CVA), Lucide icons |
| Routing | React Router 7 (React 18 compatible) |
| State | Zustand (persisted to `localStorage`) |
| Search | Fuse.js over AniList results and local datasets |
| Data | AniList GraphQL API (metadata) + JSON datasets in `src/data/` (filler classifications) |
| Tests | Vitest, React Testing Library, jsdom |
| Hosting | Vercel free tier (static) |

## Installation

Requires Node.js 20.19 or newer.

```bash
git clone https://github.com/fgamboa-stars/Anime-Filler.git
cd Anime-Filler
git checkout Version-One
npm install
cp .env.example .env   # optional — the default AniList endpoint is built in
```

## Running locally

```bash
npm run dev            # start the dev server at http://localhost:5173
npm test               # run the test suite once
npm run build          # type-check and build to dist/
npm run preview        # serve the production build
```

Data scripts:

```bash
npm run import:csv -- path/to/file.csv --anilist-id 269   # import filler data
npm run data:index                                       # rebuild src/data/index.json
npm run data:validate                                    # check datasets and catalog
```

## Project structure

```
Anime-Filler/
├── src/
│   ├── components/       Shared UI (ui/ holds shadcn-style primitives, layout/ the app shell)
│   ├── features/         Feature modules: search, episodes, watch-order, progress, arcs, anime
│   ├── pages/            Route components (lazy-loaded)
│   ├── services/         AniList client, cache, dataset loader
│   ├── store/            Zustand stores (progress, preferences)
│   ├── hooks/            Generic hooks (async, debounce, clipboard, data)
│   ├── data/             index.json catalog, anime/<slug>.json datasets, popular titles
│   ├── utils/            Dataset helpers shared with the scripts, cn()
│   ├── types/            Shared TypeScript types
│   └── test/             Test setup and page-level tests
├── scripts/              CSV import, catalog rebuild and validation (run with tsx)
├── data/                 Seed CSVs and an example import file
├── public/               Static assets
└── docs/                 Architecture, data import and deployment guides
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how metadata and filler data fit together
- [Importing data](docs/IMPORTING_DATA.md): add a new anime from a CSV
- [Deployment](docs/DEPLOYMENT.md): ship to Vercel for free

## Deployment

The app is a static site. Import the repository into Vercel, keep the defaults (framework: Vite, build: `npm run build`, output: `dist`) and deploy. `vercel.json` adds SPA rewrites and caching headers. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Data sources

- Anime metadata, ratings and artwork: [AniList](https://anilist.co) GraphQL API (no key required; ~30 requests/minute, which the client caches around).
- Naruto and Naruto Shippuden classifications: compiled from [AnimeFillerList](https://www.animefillerlist.com); arc boundaries from Narutopedia. Corrections are welcome as CSV updates.

## Future enhancements

Deliberately out of scope for Version One, and good candidates next:

- More filler guides: Bleach, One Piece, Dragon Ball, Boruto, Black Clover, Fairy Tail, Hunter x Hunter
- Optional accounts and cross-device progress sync
- Community contributions and a review queue for corrections
- An admin dashboard for imports
- A backend (Express/PostgreSQL/Prisma) and server-side search, if traffic ever needs it
- Privacy-friendly analytics and reporting
- Multi-user features such as shared watch parties
