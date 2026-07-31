-- ============================================================================
-- Cache media_external_ids' TMDB id onto media. OPTIMIZATIONS.md #7.
-- ----------------------------------------------------------------------------
-- Every poster grid did: fetch rows (joining media) -> then a SECOND query
-- (getTmdbIdMap) to map internal ids back to TMDB ids for link building. That
-- second round-trip hit Library, Watched, Watchlist, Dropped, Tiers, Stats,
-- Recently-watched and On-this-day.
--
-- media_external_ids REMAINS the source of truth — AGENTS.md introduced that
-- indirection deliberately for anime reconciliation, and this does not replace
-- it. `media.tmdb_id` is a pure cache column, maintained by trigger so there is
-- no application invariant to forget. This is the distinction that made a
-- denormalized `next_episode_id` a bad idea and makes this one fine: this value
-- has exactly one writer (the mapping table) and the trigger IS that writer.
-- ============================================================================

alter table public.media
  add column tmdb_id text;

-- Partial: anime-only rows have no TMDB id and shouldn't bloat the index.
create index media_tmdb_id_idx on public.media (tmdb_id) where tmdb_id is not null;

update public.media m
   set tmdb_id = x.external_id
  from public.media_external_ids x
 where x.media_id = m.id
   and x.source = 'tmdb';

create or replace function public.sync_media_tmdb_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.source = 'tmdb' then
      update media set tmdb_id = null
       where id = old.media_id and tmdb_id = old.external_id;
    end if;
    return old;
  end if;

  if new.source = 'tmdb' then
    update media set tmdb_id = new.external_id where id = new.media_id;
  elsif tg_op = 'UPDATE' and old.source = 'tmdb' then
    -- The row was moved off 'tmdb'; drop the stale cache value.
    update media set tmdb_id = null
     where id = old.media_id and tmdb_id = old.external_id;
  end if;
  return new;
end;
$$;

drop trigger if exists media_external_ids_sync_tmdb on public.media_external_ids;
create trigger media_external_ids_sync_tmdb
  after insert or update or delete on public.media_external_ids
  for each row execute function public.sync_media_tmdb_id();

comment on column public.media.tmdb_id is
  'Cache of media_external_ids.external_id where source=tmdb. Maintained by the media_external_ids_sync_tmdb trigger. Never write directly; media_external_ids is the source of truth.';
