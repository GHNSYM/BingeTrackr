-- ============================================================================
-- Auto-create a profile row when a user signs up.
-- ----------------------------------------------------------------------------
-- We give them a placeholder handle ('user' + first 8 chars of their uuid) so
-- the profile exists immediately. Onboarding lets them claim a real @handle.
-- SECURITY DEFINER because auth.users writes happen in the auth schema and
-- the trigger needs elevated privileges to write to public.profiles.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user' || substring(replace(new.id::text, '-', '') from 1 for 8),
    coalesce(new.raw_user_meta_data->>'name', null)
  );
  return new;
end;
$$;

-- Fire after the auth.users row is committed.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Convenience: seed default tier labels for a new user on first-tier-assignment.
-- We do this lazily rather than at signup so we don't spam tier_labels rows
-- for users who never touch the tier feature.
-- ----------------------------------------------------------------------------

create or replace function public.ensure_tier_labels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tier_labels (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_tier_assignment_ensure_labels on public.tier_assignments;
create trigger on_tier_assignment_ensure_labels
  before insert on public.tier_assignments
  for each row execute procedure public.ensure_tier_labels();
