-- Filler guides: one row per season dataset, one row per episode.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

create table if not exists public.datasets (
  slug               text primary key,
  anilist_id         integer not null,
  title              text not null,
  alternative_titles text[] not null default '{}',
  total_episodes     integer not null check (total_episodes >= 0),
  source             text,
  franchise          text,
  season_label       text,
  franchise_order    integer,
  updated_at         timestamptz not null default now()
);

create index if not exists datasets_anilist_id_idx on public.datasets (anilist_id);

create table if not exists public.episodes (
  dataset_slug text    not null references public.datasets (slug) on delete cascade,
  number       integer not null check (number > 0),
  title        text    not null default '',
  type         text    not null check (type in ('CANON', 'FILLER', 'MIXED', 'ANIME_CANON')),
  arc          text    not null default 'Standalone Episodes',
  primary key (dataset_slug, number)
);

-- Anyone may read the guides; only the service role (used by the seed script
-- and future admin tools) may write. The anon key in the browser is read-only.
alter table public.datasets enable row level security;
alter table public.episodes enable row level security;

drop policy if exists "Guides are public" on public.datasets;
create policy "Guides are public" on public.datasets for select to anon, authenticated using (true);

drop policy if exists "Episodes are public" on public.episodes;
create policy "Episodes are public" on public.episodes for select to anon, authenticated using (true);

grant select on public.datasets, public.episodes to anon, authenticated;
