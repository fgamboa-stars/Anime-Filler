-- One summary row per guide, used for the guide list, rankings and search.
-- Mirrors buildCatalogEntry() in src/utils/dataset.ts; the strip is the
-- run-length encoded classification ("C25F1M3": C canon, M mixed, A anime canon, F filler).
create or replace view public.catalog
with (security_invoker = true) as
with ordered as (
  select e.dataset_slug, e.number, e.type,
         row_number() over (partition by e.dataset_slug order by e.number)
       - row_number() over (partition by e.dataset_slug, e.type order by e.number) as run
  from public.episodes e
),
runs as (
  select dataset_slug, type, min(number) as first_number, count(*) as len
  from ordered
  group by dataset_slug, type, run
),
strips as (
  select dataset_slug,
         string_agg(case type when 'CANON' then 'C' when 'MIXED' then 'M' when 'ANIME_CANON' then 'A' else 'F' end || len,
                    '' order by first_number) as strip
  from runs
  group by dataset_slug
),
stats as (
  select dataset_slug,
         count(*) filter (where type = 'CANON')       as canon,
         count(*) filter (where type = 'FILLER')      as filler,
         count(*) filter (where type = 'MIXED')       as mixed,
         count(*) filter (where type = 'ANIME_CANON') as anime_canon,
         count(distinct arc)                          as arc_count
  from public.episodes
  group by dataset_slug
)
select d.slug, d.anilist_id, d.title, d.alternative_titles, d.total_episodes,
       d.franchise, d.season_label, d.franchise_order, d.updated_at,
       coalesce(s.canon, 0)::int as canon, coalesce(s.filler, 0)::int as filler,
       coalesce(s.mixed, 0)::int as mixed, coalesce(s.anime_canon, 0)::int as anime_canon,
       coalesce(s.arc_count, 0)::int as arc_count, coalesce(t.strip, '') as strip
from public.datasets d
left join stats s on s.dataset_slug = d.slug
left join strips t on t.dataset_slug = d.slug;

grant select on public.catalog to anon, authenticated;
