-- Write access for the weekly GitHub Actions sync, without handing out the
-- service-role key. The workflow sends a secret token; only its SHA-256 hash
-- is stored here, in a schema the REST API doesn't expose. The function can
-- only upsert whole guides (a guide row plus its episodes) — nothing else.
--
-- To set or rotate the token:  update private.sync_settings set token_hash = encode(extensions.digest('<token>', 'sha256'), 'hex');

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.sync_settings (
  id         boolean primary key default true check (id),
  token_hash text not null
);

create or replace function public.sync_guides(token text, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
  written integer;
begin
  select token_hash into expected from private.sync_settings where id;
  if expected is null or token is null
     or encode(extensions.digest(token, 'sha256'), 'hex') <> expected then
    raise exception 'invalid sync token' using errcode = '28000';
  end if;
  if jsonb_array_length(coalesce(payload->'datasets', '[]')) > 100 then
    raise exception 'too many guides in one call';
  end if;

  insert into public.datasets (slug, anilist_id, title, alternative_titles, total_episodes, source, franchise, season_label, franchise_order, updated_at)
  select d->>'slug', (d->>'anilist_id')::int, d->>'title',
         coalesce(array(select jsonb_array_elements_text(d->'alternative_titles')), '{}'),
         (d->>'total_episodes')::int, d->>'source', d->>'franchise', d->>'season_label',
         (d->>'franchise_order')::int, (d->>'updated_at')::timestamptz
  from jsonb_array_elements(payload->'datasets') d
  on conflict (slug) do update set
    anilist_id = excluded.anilist_id, title = excluded.title, alternative_titles = excluded.alternative_titles,
    total_episodes = excluded.total_episodes, source = excluded.source, franchise = excluded.franchise,
    season_label = excluded.season_label, franchise_order = excluded.franchise_order, updated_at = excluded.updated_at;

  delete from public.episodes
  where dataset_slug in (select d->>'slug' from jsonb_array_elements(payload->'datasets') d);

  insert into public.episodes (dataset_slug, number, title, type, arc)
  select e->>'dataset_slug', (e->>'number')::int, e->>'title', e->>'type', e->>'arc'
  from jsonb_array_elements(payload->'episodes') e
  where e->>'dataset_slug' in (select d->>'slug' from jsonb_array_elements(payload->'datasets') d);

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function public.sync_guides(text, jsonb) from public;
-- Callable with the public key, but useless without the token (warning 0028 in the advisors is expected).
grant execute on function public.sync_guides(text, jsonb) to anon;
