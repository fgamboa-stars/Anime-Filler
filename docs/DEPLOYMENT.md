# Deployment

Anime Filler Finder builds to static files, so it can be hosted for free. These steps use the Vercel Hobby (free) plan, which is all the app needs.

## What gets deployed

- `npm run build` type-checks and outputs `dist/` (HTML, JS chunks, CSS, fonts).
- The browser talks to AniList directly; there are no serverless functions and no secrets.
- Watch progress lives in each visitor's `localStorage`.

Monthly cost: **$0**. No paid APIs, databases, auth, search or analytics.

## Deploy with the Vercel dashboard

1. Push the `Version-One` branch to GitHub.
2. Sign in at [vercel.com](https://vercel.com) with GitHub (Hobby plan).
3. **Add New → Project**, then import `Anime-Filler`.
4. Settings (detected from `vercel.json`):
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
5. Environment variables (optional): `VITE_ANILIST_API=https://graphql.anilist.co`. The same value is the built-in default.
6. **Deploy**.

To make `Version-One` the production branch, open **Project → Settings → Git → Production Branch** and set it to `Version-One`. Otherwise every push to `Version-One` gets its own preview URL, which is useful for review.

## Deploy with the CLI

```bash
npm i -g vercel
vercel login
vercel          # preview deployment
vercel --prod   # production deployment
```

## `vercel.json`

- **SPA rewrites**: all non-asset paths serve `index.html`, so deep links such as `/anime/naruto?type=filler` work on refresh.
- **Caching**: `/assets/*` files are content-hashed and cached for a year (`immutable`).
- **Security headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.

## Other free hosts

Any static host works as long as unknown paths fall back to `index.html`:

- **Netlify**: build `npm run build`, publish `dist`, and add a `_redirects` file containing `/* /index.html 200`.
- **Cloudflare Pages**: build `npm run build`, output `dist`. SPA fallback is automatic.
- **GitHub Pages**: needs a `404.html` copy of `index.html` and a `base` setting in `vite.config.ts` if served from a subpath.

## Before each release

```bash
npm ci
npm run data:validate
npm test
npm run build
npm run preview   # spot-check http://localhost:4173
```

## Operational notes

- **AniList rate limit**: about 30 requests per minute per visitor IP. The client caches responses in `localStorage` (6–24 hours), de-duplicates requests and backs off on HTTP 429, so normal browsing stays well under the limit. Because requests come from visitors' browsers, the limit is per visitor, not shared across your audience.
- **AniList outages**: dataset pages and local search keep working; other pages show a retry message.
- **Adding anime**: import data (see [IMPORTING_DATA.md](IMPORTING_DATA.md)), commit and push. Vercel rebuilds automatically.
