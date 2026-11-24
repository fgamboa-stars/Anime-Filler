# Supabase setup (filler guides in a database)

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

## What's next on this foundation

- Load the catalog (guide list, rankings) from Supabase too, so a new guide
  appears without a redeploy.
- A scheduled job that runs the AnimeFillerList import and `supabase:seed` weekly.
- Accounts (Supabase Auth) with a `progress` table, so watched episodes sync across devices.
- A `reports` table and "Report a wrong episode" button for community corrections.
