-- ============================================================================
-- "Most watched" ranks by hours watched, not by episode count.
-- ----------------------------------------------------------------------------
-- get_stats_top_shows (20260731120004_stats_rpcs.sql) ordered by `count(*)
-- desc` — episode count — even though it already computed and returned
-- `minutes`. That silently favours a show with many short episodes over one
-- with fewer, longer episodes: a 24-episode, 20-minute-per-ep anime (480 min)
-- outranked a 10-episode, 55-minute-per-ep drama (550 min) despite the drama
-- costing more actual hours of the user's life — which is the exact number the
-- Stats page's "Most watched" row exists to surface (see its UI: "{episodes}
-- episodes · {hours}h", ranked #1 down).
--
-- This isn't a re-sort of the same five rows — the LIMIT is applied server-side
-- before the app ever sees the data, so a show with fewer episodes but more
-- minutes could be cut from the top-5 entirely under the old ordering. Only
-- fixable in the SQL that picks the set, not by re-sorting in JS afterward.
--
-- security invoker, same grants as the original — nothing else about the
-- function's shape changes.
-- ============================================================================

create or replace function public.get_stats_top_shows(
  p_user_id uuid,
  p_limit int default 5
)
returns table (
  media_id      uuid,
  title         text,
  poster_path   text,
  tmdb_id       text,
  episode_count bigint,
  minutes       bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.poster_path,
    m.tmdb_id,
    count(*)::bigint,
    coalesce(sum(we.runtime_minutes), 0)::bigint
  from watched_entries we
  join media m on m.id = we.media_id
  where we.user_id = p_user_id
    and we.episode_id is not null
  group by m.id, m.title, m.poster_path, m.tmdb_id
  order by coalesce(sum(we.runtime_minutes), 0) desc
  limit p_limit;
$$;

grant execute on function public.get_stats_top_shows(uuid, int) to authenticated, anon;
