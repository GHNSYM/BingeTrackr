-- ============================================================================
-- BingeTrackr RLS policies
-- ----------------------------------------------------------------------------
-- Two visibility patterns:
--   1) Catalog (media, seasons, etc): world-readable, service-role-only write.
--   2) User data: owner always sees own; public data (from users with
--      profiles.is_public = true) is readable by anyone. Writes: owner only.
--
-- Exception: watchlist is owner-only-read even on public profiles. "What I
-- plan to watch" is treated as more private than "what I watched".
-- ============================================================================

-- Enable RLS on everything --------------------------------------------------

alter table public.media                  enable row level security;
alter table public.media_external_ids     enable row level security;
alter table public.seasons                enable row level security;
alter table public.episodes               enable row level security;
alter table public.watch_providers_cache  enable row level security;

alter table public.profiles               enable row level security;
alter table public.watched_entries        enable row level security;
alter table public.show_progress          enable row level security;
alter table public.watchlist_entries      enable row level security;
alter table public.ratings                enable row level security;
alter table public.custom_lists           enable row level security;
alter table public.custom_list_items      enable row level security;
alter table public.tier_assignments       enable row level security;
alter table public.tier_labels            enable row level security;

-- ============================================================================
-- CATALOG: public read, service-role write only (no policy = deny)
-- ============================================================================

create policy media_public_read
  on public.media for select using (true);
create policy media_external_ids_public_read
  on public.media_external_ids for select using (true);
create policy seasons_public_read
  on public.seasons for select using (true);
create policy episodes_public_read
  on public.episodes for select using (true);
create policy watch_providers_cache_public_read
  on public.watch_providers_cache for select using (true);

-- ============================================================================
-- PROFILES
-- ============================================================================

create policy profiles_read
  on public.profiles for select
  using (is_public or id = auth.uid());

create policy profiles_insert_own
  on public.profiles for insert
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================================
-- WATCHED ENTRIES — visible on public profiles
-- ============================================================================

create policy watched_read
  on public.watched_entries for select
  using (
    user_id = auth.uid()
    or user_id in (select id from public.profiles where is_public)
  );

create policy watched_insert_own
  on public.watched_entries for insert
  with check (user_id = auth.uid());

create policy watched_update_own
  on public.watched_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy watched_delete_own
  on public.watched_entries for delete
  using (user_id = auth.uid());

-- ============================================================================
-- SHOW PROGRESS — visible on public profiles (so followers can see "currently watching")
-- ============================================================================

create policy show_progress_read
  on public.show_progress for select
  using (
    user_id = auth.uid()
    or user_id in (select id from public.profiles where is_public)
  );

create policy show_progress_write_own
  on public.show_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- WATCHLIST — owner-only (deliberate privacy choice)
-- ============================================================================

create policy watchlist_read_own
  on public.watchlist_entries for select
  using (user_id = auth.uid());

create policy watchlist_write_own
  on public.watchlist_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- RATINGS + REVIEWS — visible on public profiles
-- ============================================================================

create policy ratings_read
  on public.ratings for select
  using (
    user_id = auth.uid()
    or user_id in (select id from public.profiles where is_public)
  );

create policy ratings_write_own
  on public.ratings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- CUSTOM LISTS — per-list is_public flag
-- ============================================================================

create policy custom_lists_read
  on public.custom_lists for select
  using (is_public or user_id = auth.uid());

create policy custom_lists_write_own
  on public.custom_lists for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- List items follow the parent list's visibility
create policy custom_list_items_read
  on public.custom_list_items for select
  using (
    list_id in (
      select id from public.custom_lists where is_public or user_id = auth.uid()
    )
  );

create policy custom_list_items_write_own
  on public.custom_list_items for all
  using (
    list_id in (select id from public.custom_lists where user_id = auth.uid())
  )
  with check (
    list_id in (select id from public.custom_lists where user_id = auth.uid())
  );

-- ============================================================================
-- TIERS — visible on public profiles
-- ============================================================================

create policy tier_assignments_read
  on public.tier_assignments for select
  using (
    user_id = auth.uid()
    or user_id in (select id from public.profiles where is_public)
  );

create policy tier_assignments_write_own
  on public.tier_assignments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy tier_labels_read
  on public.tier_labels for select
  using (
    user_id = auth.uid()
    or user_id in (select id from public.profiles where is_public)
  );

create policy tier_labels_write_own
  on public.tier_labels for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
