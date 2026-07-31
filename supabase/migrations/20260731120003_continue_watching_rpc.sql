-- ============================================================================
-- One query for Continue Watching. OPTIMIZATIONS.md #1 — the last P1 item.
-- ----------------------------------------------------------------------------
-- Before: one query PER SHOW, each fetching *every* episode of that show, then
-- finding the next unwatched one in JS. Measured at 5 queries / 171 episode
-- rows / 32 KB to extract 5 episodes — 34x more data than needed. The Library
-- "Watching" tab calls it with limit=50, so worst case was 50 queries and
-- several thousand rows for one page view.
--
-- After: 1 query, <=limit rows.
--
-- Why an RPC and not a denormalized show_progress.next_episode_id: the next
-- episode is derived from the resume pointer AND the episode catalogue, and the
-- catalogue moves on its own (ensureSeasonCached fills seasons lazily; new
-- seasons air). A stored pointer computed when S2 wasn't cached yet would say
-- "all caught up" forever, with nothing to recompute it when S2 arrives via an
-- unrelated title-page visit. Silent failure of the founding feature.
--
-- The row-constructor comparison below is the whole trick: it expresses "first
-- episode after the resume point" in (season, episode) order natively, which is
-- exactly what the JS sort-then-find did.
--
-- security invoker: RLS on show_progress / watched_entries / media / episodes
-- still applies as the calling user. The explicit auth.uid() filter is for the
-- index, not for safety.
-- ============================================================================

create or replace function public.get_continue_watching(p_limit int default 12)
returns table (
  media_id             uuid,
  title                text,
  poster_path          text,
  tmdb_id              text,
  current_season       int,
  current_episode      int,
  total_episodes       int,
  total_watched        bigint,
  next_episode_id      uuid,
  next_season_number   int,
  next_episode_number  int,
  next_name            text,
  next_runtime_minutes int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sp.media_id,
    m.title,
    m.poster_path,
    m.tmdb_id,
    sp.current_season,
    sp.current_episode,
    -- Mirrors the old `media.episode_count ?? sorted.length` fallback. Without
    -- ec.cnt, shows with a null episode_count would silently render 0 now that
    -- we no longer fetch every episode.
    coalesce(m.episode_count, ec.cnt)::int,
    coalesce(w.cnt, 0),
    nx.id,
    nx.season_number,
    nx.episode_number,
    nx.name,
    nx.runtime_minutes
  from show_progress sp
  join media m on m.id = sp.media_id
  left join lateral (
    select count(*)::int as cnt
      from episodes e
      join seasons s on s.id = e.season_id
     where s.media_id = sp.media_id
  ) ec on true
  -- Replaces a fetchAllRows() that pulled every watched episode row across all
  -- shows purely to count them in JS.
  left join lateral (
    select count(*) as cnt
      from watched_entries we
     where we.user_id = sp.user_id
       and we.media_id = sp.media_id
       and we.episode_id is not null
  ) w on true
  left join lateral (
    select e.id, e.name, e.episode_number, e.runtime_minutes, s.season_number
      from episodes e
      join seasons s on s.id = e.season_id
     where s.media_id = sp.media_id
       and (s.season_number, e.episode_number)
           > (coalesce(sp.current_season, 1), coalesce(sp.current_episode, 0))
     order by s.season_number, e.episode_number
     limit 1
  ) nx on true
  where sp.user_id = auth.uid()
    and sp.status = 'watching'
  order by sp.status_changed_at desc
  limit p_limit;
$$;

grant execute on function public.get_continue_watching(int) to authenticated;
