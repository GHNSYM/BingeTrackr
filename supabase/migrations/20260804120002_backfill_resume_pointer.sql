-- ============================================================================
-- One-time repair: recompute every existing show_progress pointer from truth.
-- ----------------------------------------------------------------------------
-- `unmarkEpisodeAction`/`unmarkSeasonWatchedAction` used to delete from
-- watched_entries without touching show_progress.current_season/episode at
-- all — fixed in application code (recomputeResumePointer, actions.ts) so
-- every FUTURE unmark self-heals the pointer. That fix is go-forward only: any
-- show_progress row already left stale by an unmark taken BEFORE the fix
-- existed stays stale until something recomputes it, and nothing does that
-- automatically for a row nobody touches again.
--
-- This is that one-time catch-up, expressed as the same "furthest watched
-- (season, episode)" derivation `recomputeResumePointer` uses, as a single
-- bulk statement instead of one row at a time. Verified against a live,
-- fully isolated test user/media/episode set (created and torn down for the
-- purpose, touching no real data) before writing this: mark E1, unmark E1,
-- recompute → get_continue_watching correctly offers E1 next, not E2.
--
-- Idempotent — safe to run more than once. Only ever touches
-- current_season/current_episode/last_watched_episode; never status,
-- status_changed_at, or any other table.
-- ============================================================================

-- Shows with at least one watched episode remaining: pointer -> the furthest
-- (season, episode) among what's actually watched.
with furthest as (
  select distinct on (we.user_id, we.media_id)
    we.user_id,
    we.media_id,
    s.season_number,
    e.episode_number,
    we.episode_id
  from watched_entries we
  join episodes e on e.id = we.episode_id
  join seasons  s on s.id = e.season_id
  where we.episode_id is not null
  order by we.user_id, we.media_id, s.season_number desc, e.episode_number desc
)
update show_progress sp
set
  current_season       = f.season_number,
  current_episode      = f.episode_number,
  last_watched_episode = f.episode_id
from furthest f
where sp.user_id = f.user_id
  and sp.media_id = f.media_id
  and (
    sp.current_season       is distinct from f.season_number
    or sp.current_episode   is distinct from f.episode_number
    or sp.last_watched_episode is distinct from f.episode_id
  );

-- Shows with ZERO watched episodes remaining (every mark was undone): pointer
-- clears to null, which get_continue_watching's coalesce(..., 1)/coalesce(...,
-- 0) already treats as "before episode 1" — i.e. next = the show's real E1.
update show_progress sp
set
  current_season       = null,
  current_episode       = null,
  last_watched_episode = null
where not exists (
  select 1 from watched_entries we
   where we.user_id = sp.user_id
     and we.media_id = sp.media_id
     and we.episode_id is not null
)
and (sp.current_season is not null or sp.current_episode is not null or sp.last_watched_episode is not null);
