-- ============================================================================
-- Fix the media_external_ids primary-key collision. OPTIMIZATIONS.md #9.
-- ----------------------------------------------------------------------------
-- The PK was (source, external_id). TMDB numbers movies and TV in SEPARATE
-- namespaces, so movie 550 and show 550 are different titles that collided on
-- one row. Consequences today:
--
--   * upsertMedia() finds the wrong row, updates the wrong title's media
--     record, and returns the wrong media_id.
--   * getQuickTrackStates and resolveMediaId both carry work-arounds that
--     re-check media.type after the fact.
--
-- Fix: make the discriminator part of the key. `media_type` is denormalized
-- from media.type, which is safe *because it is immutable in practice* — a
-- title does not change from movie to tv — and because a composite FK makes
-- the database enforce agreement rather than application code.
-- ============================================================================

-- A composite FK needs a unique constraint on the referenced columns. `id` is
-- already the PK so this is logically redundant, but it's what lets us
-- reference (id, type) below.
alter table public.media
  add constraint media_id_type_key unique (id, type);

-- Discriminator, backfilled from the media row it points at.
alter table public.media_external_ids
  add column media_type text;

update public.media_external_ids x
   set media_type = m.type
  from public.media m
 where m.id = x.media_id;

alter table public.media_external_ids
  alter column media_type set not null;

-- Repoint the primary key. No existing row can violate the new key: the old,
-- narrower PK already guaranteed (source, external_id) was unique.
alter table public.media_external_ids
  drop constraint media_external_ids_pkey;

alter table public.media_external_ids
  add constraint media_external_ids_pkey
  primary key (source, external_id, media_type);

-- Replace the single-column FK with a composite one, so media_type can never
-- drift from media.type. ON UPDATE CASCADE means correcting a media row's type
-- (e.g. reclassifying a TV entry as anime during AniList reconciliation)
-- propagates instead of erroring.
alter table public.media_external_ids
  drop constraint media_external_ids_media_id_fkey;

alter table public.media_external_ids
  add constraint media_external_ids_media_fkey
  foreign key (media_id, media_type)
  references public.media(id, type)
  on update cascade
  on delete cascade;

comment on column public.media_external_ids.media_type is
  'Denormalized copy of media.type, part of the PK because TMDB namespaces ids by type. Kept honest by the composite FK — do not write it by hand.';

-- ----------------------------------------------------------------------------
-- SIDE EFFECT, verified after apply: PostgREST derives its embedding
-- relationships from foreign keys, so replacing the single-column FK with a
-- composite one REMOVES the ability to embed media from this table.
--
--   .from("media_external_ids").select("media_id, media:media_id ( type )")
--   -> "Could not find a relationship between 'media_external_ids' and
--      'media_id' in the schema cache"
--
-- That is fine here, and in fact the point: the only query that did this was
-- getQuickTrackStates, which embedded `media` purely to read `type` — and it now
-- reads `media_type` off this row instead. But if you ever need media columns
-- alongside a mapping row again, join in an RPC or do a second query. Don't
-- restore the single-column FK; it is what allowed the collision.
-- ----------------------------------------------------------------------------
