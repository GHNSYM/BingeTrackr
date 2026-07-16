# Supabase migrations

Version-controlled SQL for BingeTrackr's Postgres schema. Two paths to apply — pick one and stick with it.

## Migrations

| File | What |
|---|---|
| `20260716120001_initial_schema.sql` | Media catalog + user data + tiers |
| `20260716120002_rls_policies.sql` | Row-level security on every table |
| `20260716120003_auto_profile_trigger.sql` | Auto-create profile on signup |

Apply in numeric order — the RLS migration depends on tables from the schema migration.

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
