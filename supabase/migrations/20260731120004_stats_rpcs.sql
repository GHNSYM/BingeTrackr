-- ============================================================================
-- Aggregate stats in Postgres instead of JS. OPTIMIZATIONS.md #4.
-- ----------------------------------------------------------------------------
-- getStats() is correct today but reads EVERY watched entry to compute sums:
-- ceil(n/1000) requests and the whole table over the wire. At 1498 rows that's
-- 2 requests; at 20k it's 20 and megabytes of egress per stats view. Same shape
-- in getPublicProfileCounts, which sums runtime_minutes in JS.
--
-- Four functions rather than one: the callers want a totals row, a top-shows
-- list, an on-this-day list and a profile-header row, and PostgREST returns one
-- result set per call. Splitting them also means Home's stat strip never pays
-- for top-shows aggregation.
--
-- get_on_this_day replaces TWO implementations — getOnThisDay() and the
-- redundant getStats().onThisDay (see DESIGN_ROADMAP.md). PostgREST can't filter
-- on EXTRACT(MONTH FROM ...), which forced either a full-table scan matched in
-- JS or an OR'd one-day-range-per-year hack. In SQL it's just a predicate.
--
-- security invoker throughout: RLS decides whether a caller may read another
-- user's rows (public profiles), exactly as the JS versions did.
--
-- TIMEZONE: p_tz defaults to 'UTC' because that is what the JS did — `new Date()`
-- on a Vercel function is UTC. For an India-first product "this year" and "on
-- this day" arguably belong in Asia/Kolkata; that's a product decision, so it's
-- a parameter rather than a silent behaviour change.
-- ============================================================================

create or replace function public.get_stats_totals(
  p_user_id uuid,
  p_tz text default 'UTC'
)
returns table (
  total_minutes      bigint,
  movies_watched     bigint,
  episodes_watched   bigint,
  shows_completed    bigint,
  year_minutes       bigint,
  year_movies        bigint,
  year_episodes      bigint,
  movie_minutes      bigint,
  tv_minutes         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with entries as (
    select we.runtime_minutes, we.episode_id, we.watched_at, m.type
      from watched_entries we
      join media m on m.id = we.media_id
     where we.user_id = p_user_id
  ),
  cur as (select extract(year from (now() at time zone p_tz))::int as y)
  select
    coalesce(sum(e.runtime_minutes), 0)::bigint,
    count(*) filter (where e.episode_id is null)::bigint,
    count(*) filter (where e.episode_id is not null)::bigint,
    (select count(*) from show_progress sp
      where sp.user_id = p_user_id and sp.status = 'completed')::bigint,
    coalesce(sum(e.runtime_minutes) filter (
      where extract(year from (e.watched_at at time zone p_tz))::int = cur.y), 0)::bigint,
    count(*) filter (
      where e.episode_id is null
        and extract(year from (e.watched_at at time zone p_tz))::int = cur.y)::bigint,
    count(*) filter (
      where e.episode_id is not null
        and extract(year from (e.watched_at at time zone p_tz))::int = cur.y)::bigint,
    coalesce(sum(e.runtime_minutes) filter (where e.type = 'movie'), 0)::bigint,
    coalesce(sum(e.runtime_minutes) filter (where e.type = 'tv'), 0)::bigint
  from entries e cross join cur
  group by cur.y;
$$;

grant execute on function public.get_stats_totals(uuid, text) to authenticated, anon;

-- ----------------------------------------------------------------------------

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
  order by count(*) desc
  limit p_limit;
$$;

grant execute on function public.get_stats_top_shows(uuid, int) to authenticated, anon;

-- ----------------------------------------------------------------------------

create or replace function public.get_on_this_day(
  p_user_id uuid,
  p_limit int default 12,
  p_tz text default 'UTC'
)
returns table (
  media_id    uuid,
  title       text,
  poster_path text,
  tmdb_id     text,
  media_type  text,
  watched_at  timestamptz,
  years_ago   int,
  is_episode  boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select
      extract(month from (now() at time zone p_tz))::int as mm,
      extract(day   from (now() at time zone p_tz))::int as dd,
      extract(year  from (now() at time zone p_tz))::int as yy
  ),
  hits as (
    select
      we.media_id,
      we.watched_at,
      we.episode_id,
      extract(year from (we.watched_at at time zone p_tz))::int as wy,
      row_number() over (
        partition by we.media_id order by we.watched_at desc
      ) as rn
    from watched_entries we cross join today t
    where we.user_id = p_user_id
      and extract(month from (we.watched_at at time zone p_tz))::int = t.mm
      and extract(day   from (we.watched_at at time zone p_tz))::int = t.dd
      and extract(year  from (we.watched_at at time zone p_tz))::int < t.yy
  )
  -- One row per title: a binge shouldn't fill the rail with one show.
  select
    h.media_id,
    m.title,
    m.poster_path,
    m.tmdb_id,
    m.type,
    h.watched_at,
    (t.yy - h.wy)::int,
    h.episode_id is not null
  from hits h
  join media m on m.id = h.media_id
  cross join today t
  where h.rn = 1
  order by h.watched_at desc
  limit p_limit;
$$;

grant execute on function public.get_on_this_day(uuid, int, text) to authenticated, anon;

-- ----------------------------------------------------------------------------

create or replace function public.get_profile_counts(p_user_id uuid)
returns table (
  shows    bigint,
  episodes bigint,
  hours    bigint,
  lists    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from show_progress sp where sp.user_id = p_user_id)::bigint,
    (select count(*) from watched_entries we
      where we.user_id = p_user_id and we.episode_id is not null)::bigint,
    (select coalesce(sum(we.runtime_minutes), 0) / 60 from watched_entries we
      where we.user_id = p_user_id)::bigint,
    (select count(*) from custom_lists cl
      where cl.user_id = p_user_id and cl.is_public)::bigint;
$$;

grant execute on function public.get_profile_counts(uuid) to authenticated, anon;
