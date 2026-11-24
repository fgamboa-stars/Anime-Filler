# Supabase setup (filler guides in a database)

> **Status (Nov 23, 2026): set up.** Project `anime-filler` (ref `qzsoelgnckqictieqowh`, region us-east-2) in the
> *Flogic* organization has the tables from `0001_filler_guides.sql` and all 334 guides / 12,223 episodes.
> The site uses it by default (URL and publishable key are in `src/services/supabase.ts`), so no Vercel
> environment variables are needed. The steps below are for re-creating it or seeding again.
>
> **The guide list is live too** (migration `0002_catalog_view.sql`): Home, Discover, search and rankings
> read the `catalog` view, so a guide added to the database appears on the site without a redeploy.
> The site shows the built-in list first, swaps in the database list when it arrives (cached in the
> browser for 6 hours), and keeps the built-in list if the database is unreachable.

The site still runs on Vercel exactly as before. Supabase is an extra service
the site *reads from*: when it's configured, guide pages load their episodes
from the database; when it isn't (or it's down), the site uses the JSON bundled
with the build. Nothing breaks either way.

This branch (`supabase-backend`) adds:

| File | What it does |
| --- | --- |
| `supabase/migrations/0001_filler_guides.sql` | Creates the `datasets` and `episodes` tables, public read-only access |
| `src/services/supabase.ts` | Reads a guide from Supabase's REST API (no extra library) |
| `src/services/datasets.ts` | Tries Supabase first, falls back to the bundled JSON |
| `scripts/supabase-seed.ts` | Copies all 334 local guides into Supabase (`npm run supabase:seed`) |

## 1. Create a free Supabase account and project

1. Go to <https://supabase.com> and sign up (GitHub login works). The Free plan is enough.
2. **New project** → name it `anime-filler`, set a database password (save it somewhere), pick a region near you (e.g. *East US*), and create it. It takes a minute or two.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the whole contents of `supabase/migrations/0001_filler_guides.sql` and click **Run**.
3. **Table Editor** should now show `datasets` and `episodes` (empty).

## 3. Copy your keys

Open **Project Settings → API** (or **Data API / API Keys**):

- **Project URL** – looks like `https://abcd1234.supabase.co`
- **anon / publishable key** – safe to use in the website (read-only because of row-level security)
- **service_role / secret key** – full access. Only for your own computer. Never put it on Vercel or in a `VITE_` variable.

## 4. Load the guides into Supabase (on your computer)

In the project folder, create a file named `.env` (it's git-ignored):

```
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```
npm install
npm run supabase:seed -- --dry-run   # should say: 334 guides, 12223 episodes
npm run supabase:seed
```

Re-run it any time after importing or editing guides; it replaces each guide's
episodes. Add `--prune` to also remove guides you've deleted locally.

Check it worked: `npm run dev`, open a guide page, and in the browser's Network
tab you'll see a request to `…supabase.co/rest/v1/datasets`.

## 5. Turn it on for the Vercel preview

In Vercel → **anime_filler** → **Settings → Environment Variables**, add:

| Name | Value | Environments |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | your Project URL | **Preview** only (for now) |
| `VITE_SUPABASE_ANON_KEY` | your anon key | **Preview** only (for now) |

Then redeploy the `supabase-backend` preview (Deployments → latest preview → ⋯ → Redeploy).
Production keeps using the bundled JSON until you also tick **Production** and
merge this branch.

## Weekly automatic updates (GitHub Actions)

`.github/workflows/weekly-sync.yml` runs every Monday at 3:23 AM Chicago time, and can be started by hand
from the repo's **Actions** tab → *Weekly guide sync* → **Run workflow**. It:

1. checks AnimeFillerList for new shows, and re-checks shows skipped earlier because they were still airing
   or their episode counts didn't add up yet (`npm run afl:match -- --retry-skipped`);
2. imports the ones that now match AniList's finished seasons (`npm run afl:import`), and adds new episodes of the still-airing shows in `data/afl/airing.json` (`npm run afl:airing`);
3. checks the episode numbering against AniList (`afl:verify`), validates the data and runs the tests —
   if anything fails, nothing is written;
4. writes every guide to Supabase through the `sync_guides()` function (`npm run supabase:seed`), so the
   live site updates within minutes;
5. pushes the updated guide files to the `data-sync` branch (never to `main`). Merge it whenever you want the
   built-in fallback copy to catch up.

**Cost: free.** GitHub Actions minutes are unlimited for public repositories, and a run uses well under an hour.

**One-time setup:** in GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**,
add `SUPABASE_SYNC_TOKEN` with the sync token. The token can only call `sync_guides()` (upsert whole guides);
only its SHA-256 hash is stored in the database (`private.sync_settings`). To rotate it, run in the SQL editor:

```sql
update private.sync_settings set token_hash = encode(extensions.digest('NEW-TOKEN', 'sha256'), 'hex');
```

and update the GitHub secret. Supabase's security advisor will list `sync_guides` as callable with the public
key; that is expected, because it refuses every call without the token.

Scheduled workflows only run from the default branch, so the schedule starts once this branch is merged into `main`.

## What's next on this foundation

- Accounts (Supabase Auth) with a `progress` table, so watched episodes sync across devices.
- A `reports` table and "Report a wrong episode" button for community corrections.
