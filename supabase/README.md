# Supabase migrations

Version-controlled SQL for BingeTrackr's Postgres schema. Two paths to apply — pick one and stick with it.

## Migrations

| File | What | Applied? |
|---|---|---|
| `20260716120001_initial_schema.sql` | Media catalog + user data + tiers | yes |
| `20260716120002_rls_policies.sql` | Row-level security on every table | yes |
| `20260716120003_auto_profile_trigger.sql` | Auto-create profile on signup | yes |
| `20260731120001_media_external_ids_type.sql` | PK collision fix (OPTIMIZATIONS #9) | yes |
| `20260731120002_media_tmdb_id_cache.sql` | `media.tmdb_id` cache column (#7) | yes |
| `20260731120003_continue_watching_rpc.sql` | `get_continue_watching()` (#1) | yes |
| `20260731120004_stats_rpcs.sql` | Stats / on-this-day / profile-count RPCs (#4) | yes |
| `20260804120001_stats_top_shows_by_minutes.sql` | `get_stats_top_shows` ranks by hours watched, not episode count | **no — run this one** |
| `20260804120002_backfill_resume_pointer.sql` | One-time repair of `show_progress` rows left stale by unmarks taken before the app-code fix existed | **no — run this one too** |

Apply in numeric order — the RLS migration depends on tables from the schema
migration, and `…0003` depends on `…0002` which depends on `…0001`.

Two invariants the 2026-07-31 batch introduced, both enforced by the database:

- `media_external_ids.media_type` is **NOT NULL** and carries a composite FK to
  `media(id, type)`. Every insert must supply it, and it must match the media
  row's type.
- `media.tmdb_id` is a **trigger-maintained cache** of the `source = 'tmdb'`
  mapping. Never write it directly.

---

## Path A — SQL editor (fast, no CLI setup)

For the first-time apply. Takes ~2 minutes.

1. Open the Supabase dashboard → **SQL editor** → **New query**
2. Copy `20260716120001_initial_schema.sql` → paste → **Run**
3. Repeat for `20260716120002_rls_policies.sql`
4. Repeat for `20260716120003_auto_profile_trigger.sql`

Check the **Table editor** — you should see `media`, `profiles`, `watched_entries`, `show_progress`, `tier_assignments`, and about a dozen others under the `public` schema. Every table should show the RLS shield icon.

**Downside:** future schema changes are unmanaged — you edit tables in the dashboard and forget which SQL produced the current state. Fine for the first migration, painful by the third.

## Path B — Supabase CLI (proper, do this before your second migration)

For every migration after the first, so schema stays version-controlled.

### One-time setup

```powershell
# Scoop is the cleanest Windows installer for supabase CLI
# If you don't have Scoop: iwr -useb get.scoop.sh | iex
scoop install supabase

# Or via npx (no install, slower per-run)
# npx supabase@latest --version
```

### Link this repo to your remote project

```powershell
cd C:\Users\ghans\Desktop\BingeTrackr\web

# Opens a browser to authenticate
supabase login

# Link — grab the ref from your NEXT_PUBLIC_SUPABASE_URL
# (the subdomain before .supabase.co)
supabase link --project-ref <your-project-ref>
```

### Apply new migrations

```powershell
# Push local migrations that haven't been applied yet
supabase db push

# When you make a schema change: write a new migration file, then
supabase db push
```

### Generate TypeScript types

```powershell
supabase gen types typescript --linked > src/types/database.ts
```

Now `createClient()` returns a fully typed client. Rewire `lib/supabase/client.ts` and `lib/supabase/server.ts` to pass `<Database>` as the type parameter.

---

## Rollback

Migrations are forward-only. To undo one, write a new migration that reverses the change. Never edit an applied migration file — it breaks the migration history table.

## Local dev DB

Not set up. `supabase start` (local dev) requires Docker; we're staying remote-only until scale demands otherwise. Migrations are still tested against production — be careful with destructive changes.
