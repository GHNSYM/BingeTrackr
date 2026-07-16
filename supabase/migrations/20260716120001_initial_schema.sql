-- ============================================================================
-- BingeTrackr v1 initial schema
-- ----------------------------------------------------------------------------
-- Two halves: media catalog (what exists in the world) + user data (what users
-- do with it). Media rows are lazily created from TMDB/AniList as users touch
-- titles — we NEVER bulk-import the catalogue (TMDB ToS + free-tier limits).
-- ============================================================================

-- Extensions --------------------------------------------------------------
create extension if not exists citext with schema extensions;
-- pgcrypto is preinstalled on Supabase — gives us gen_random_uuid().

-- ============================================================================
-- MEDIA CATALOG
-- ============================================================================

-- Internal canonical media record. We control the ID so anime can be linked
-- to both TMDB (TV entry) and AniList (definitive) via media_external_ids.
create table public.media (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('movie','tv','anime')),
  title           text not null,
  original_title  text,
  overview        text,
  poster_path     text,
  backdrop_path   text,
  release_year    int,
  -- Movies: total runtime. TV/anime: average episode runtime (fallback for stats).
  runtime_minutes int,
  episode_count   int,
  last_synced_at  timestamptz not null default now(),
  -- Full-text search. 'simple' config (no stemming) so it works for Hindi/Tamil
  -- transliterations and titles like "RRR" without English-stemming false matches.
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(original_title, '')), 'B')
  ) stored
);
create index media_search_idx     on public.media using gin(search_vector);
create index media_type_year_idx  on public.media(type, release_year desc);

-- Maps our internal id to external catalogue ids.
create table public.media_external_ids (
  media_id    uuid not null references public.media(id) on delete cascade,
  source      text not null check (source in ('tmdb','anilist','imdb','mal')),
  external_id text not null,
  primary key (source, external_id)
);
create index media_external_media_idx on public.media_external_ids(media_id);

-- Seasons + episodes only for TV and anime.
create table public.seasons (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references public.media(id) on delete cascade,
  season_number int not null,
  name          text,
  episode_count int,
  air_date      date,
  unique (media_id, season_number)
);

create table public.episodes (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id) on delete cascade,
  episode_number  int not null,
  name            text,
  runtime_minutes int,
  air_date        date,
  unique (season_id, episode_number)
);
create index episodes_season_idx on public.episodes(season_id, episode_number);

-- Region-aware streaming provider cache. TTL of 7 days enforced in application code.
create table public.watch_providers_cache (
  media_id  uuid not null references public.media(id) on delete cascade,
  region    text not null,
  -- { flatrate: [...], rent: [...], buy: [...] } from TMDB /watch/providers
  providers jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (media_id, region)
);

-- ============================================================================
-- USER DATA
-- ============================================================================

-- Extends auth.users. Auto-created on signup by the trigger in migration 0003.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  -- citext = case-insensitive text. "Aanya" and "aanya" collide.
  username      citext unique not null,
  display_name  text,
  avatar_url    text,
  bio           text,
  is_public     boolean not null default false,
  region        text default 'IN',
  -- One of the six banner theme keys: aurora, ember, forest, rose, gold, mono.
  banner_theme  text default 'mono',
  created_at    timestamptz not null default now()
);
-- Partial index makes the "is user X publicly visible?" subquery in RLS cheap
-- even at scale.
create index profiles_public_idx   on public.profiles(id) where is_public = true;
create index profiles_username_idx on public.profiles(username);

-- Unified activity log. Movies AND episodes go here. One shape, one index,
-- one SUM for "hours watched". episode_id IS NULL means a movie watch.
create table public.watched_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  media_id        uuid not null references public.media(id) on delete cascade,
  episode_id      uuid references public.episodes(id) on delete cascade,
  watched_at      timestamptz not null default now(),
  rewatch_number  int not null default 1,
  -- Denormalized from media.runtime_minutes (movies) or episodes.runtime_minutes
  -- so lifetime-hours-watched is a single SUM with no joins.
  runtime_minutes int
);
create index watched_user_time_idx  on public.watched_entries(user_id, watched_at desc);
create index watched_user_media_idx on public.watched_entries(user_id, media_id);

-- Episode-resume tracker. Founding feature — do not derive from watched_entries;
-- users need explicit control (they mark random episodes, jump around, etc).
create table public.show_progress (
  user_id              uuid references auth.users(id) on delete cascade,
  media_id             uuid references public.media(id) on delete cascade,
  current_season       int,
  current_episode      int,
  last_watched_episode uuid references public.episodes(id) on delete set null,
  status               text not null check (status in ('watching','completed','paused','dropped')),
  status_changed_at    timestamptz not null default now(),
  primary key (user_id, media_id)
);
create index show_progress_status_idx on public.show_progress(user_id, status);

-- Watchlist is deliberately more private than watched history — many users
-- consider "what I plan to watch" more revealing than what they finished.
create table public.watchlist_entries (
  user_id  uuid references auth.users(id) on delete cascade,
  media_id uuid references public.media(id) on delete cascade,
  priority int default 0,
  added_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

-- Numeric rating (score) + optional tier letter (for the tier list feature) +
-- optional review text. All optional so you can rate without reviewing.
create table public.ratings (
  user_id      uuid references auth.users(id) on delete cascade,
  media_id     uuid references public.media(id) on delete cascade,
  score        int check (score between 1 and 10),
  tier_letter  text check (tier_letter in ('S','A','B','C','D','F')),
  review_text  text,
  reviewed_at  timestamptz not null default now(),
  primary key (user_id, media_id)
);
create index ratings_media_idx on public.ratings(media_id);

-- Custom user lists ("Comfort rewatches", "Must-watch Malayalam cinema", ...)
create table public.custom_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  is_public   boolean not null default false,
  -- If true, list order is meaningful (top 10 lists). If false, it's a bucket.
  is_ordered  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, slug)
);

create table public.custom_list_items (
  list_id  uuid references public.custom_lists(id) on delete cascade,
  media_id uuid references public.media(id) on delete cascade,
  position int,
  note     text,
  added_at timestamptz not null default now(),
  primary key (list_id, media_id)
);

-- ============================================================================
-- TIER LIST (flagship feature)
-- ============================================================================

-- One row per (user, media) assigned to a tier. Unranked titles = no row.
create table public.tier_assignments (
  user_id  uuid references auth.users(id) on delete cascade,
  media_id uuid references public.media(id) on delete cascade,
  tier     text not null check (tier in ('S','A','B','C','D')),
  primary key (user_id, media_id)
);
create index tier_user_idx on public.tier_assignments(user_id, tier);

-- User's custom labels for their tier bands (max 3 chars per design spec).
create table public.tier_labels (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  s_label    text default 'S' check (char_length(s_label) <= 3),
  a_label    text default 'A' check (char_length(a_label) <= 3),
  b_label    text default 'B' check (char_length(b_label) <= 3),
  c_label    text default 'C' check (char_length(c_label) <= 3),
  d_label    text default 'D' check (char_length(d_label) <= 3),
  updated_at timestamptz not null default now()
);
