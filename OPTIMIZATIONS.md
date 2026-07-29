# Optimization backlog

Deferred work to keep BingeTrackr inside the Supabase / TMDB / Vercel free
tiers as usage grows. **Nothing here is urgent at current scale.** This exists
so we don't have to rediscover it under pressure.

## The rule

**Feature above usage.** Never cut a feature, a section, or a poster count to
save a request. If a feature and the free tier genuinely conflict, the answer
is a better query, a cache, or a paid tier — not a worse product.

Corollary: don't pre-optimize either. Every item below is written so it can be
picked up when a metric says so, not on vibes. But items marked **P1** are
known-wasteful paths, not speculation — they're worth doing before real users
arrive because they get harder to fix later.

## Where the cost actually is

Ordered by real risk, not by intuition:

1. **Supabase egress + row volume.** This is the binding constraint. Free tier
   is a few GB of egress a month and 500 MB of database. Pulling thousands of
   rows to compute one number burns egress with nothing to show for it. The
   free project also **pauses after ~7 days of inactivity** — worth knowing
   before a demo.
2. **Vercel function invocations and duration.** Every page here is dynamic
   (`ƒ` in the build output), so every view is a function call. Long
   TMDB-blocked renders cost duration.
3. **TMDB is mostly *not* a quota problem.** They lifted the old hard rate
   limit, and Next's `fetch` cache already dedupes and reuses responses across
   requests (`revalidate` is set per endpoint in `src/lib/tmdb/client.ts`).
   Treat TMDB as a **latency** and **ToS** concern — don't mirror their
   catalogue — rather than a request budget.

> Verify current free-tier numbers against the providers' own pricing pages
> before acting on any of this. Limits change, and the ones above are from
> memory rather than from a doc we control.

## Measured baseline — 2026-07-30

Actual figures from the dev database, for comparison later:

| Table | Rows |
|---|---|
| `media` | 63 |
| `seasons` | 75 |
| `episodes` | 1496 |
| `watched_entries` | 1498 |
| `show_progress` | 16 |
| `watchlist_entries` | 23 |

Per-request costs measured on the same data:

- **Continue Watching (5 shows):** 5 Supabase queries, **171 episode rows,
  32 KB** — to extract **5** episodes. 34× more data than needed.
- **Title page (movie, cold cache):** ~6 distinct TMDB calls
  (`/movie`, `/watch/providers`, `/collection`, `/recommendations`,
  `/similar`, plus `/season` for TV) and ~12-15 Supabase queries.
- **`auth.getUser()` on the title page render path: 6 uncached calls.**

---

## P1 — do before real users

### 1. `getContinueWatching` pulls every episode of every show

`src/lib/tracking/queries.ts` → `getContinueWatching`

One query **per show**, and each one fetches *all* episodes of that show, then
finds the next unwatched one in JS. Measured at 34× waste above. The Library
"Watching" tab calls this with `limit = 50`, so worst case is 50 queries and
several thousand rows for a single page view. The function's own comment admits
this was a deliberate stopgap while the query shape settled. It has settled.

Fix, best first:

- **Postgres RPC with a lateral join** — one query returning one "next episode"
  row per show. Kills both the N+1 and the payload.
- **Denormalize `next_episode_id` onto `show_progress`**, maintained on each
  mark. Read cost drops to zero extra queries; costs one lookup per write.
  Simpler, but adds an invariant to keep honest.

Either needs a migration, so it's the user's call to author.

Note the payload problem is separate from the N+1: even scoped to one show,
`season_number` lives on the joined `seasons` table, so we can't
`.order().limit(1)` on (season, episode) directly. A denormalized sort key on
`episodes` would let a single row come back per show.

### 2. `auth.getUser()` is called 6× per title-page render

Every query helper independently calls `createClient()` then
`supabase.auth.getUser()`. **`getUser()` is a network round-trip** — it
validates the JWT against Supabase Auth rather than reading it locally.

`getUserAndProfile` in `src/lib/auth/require-user.ts` is already wrapped in
React's `cache()` and gets this right. Nothing else is.

Fix: a `cache()`d `getCurrentUser()` and route every helper through it. Low
risk, mechanical, measurable — should take one page from ~8 auth round-trips
(including middleware and layout) to 1.

### 3. Quick actions hit TMDB even when the title is already cached

`src/lib/tracking/quick-actions.ts` → `resolveMediaId`

Every Watched/Watchlist click on a poster calls `getMovie`/`getTv` purely to
resolve a TMDB id to our internal `media.id`, even when `media_external_ids`
already has the mapping. We refetch server-side on purpose — so a client can't
write arbitrary rows into `media` — but that reasoning only applies when we
actually need to *insert*.

Fix: look up `media_external_ids` first and return early on a hit; fall through
to the TMDB fetch only for genuinely new titles. Removes a TMDB call and a
`media` update from the common path. Cheap, self-contained, no migration.

---

## P2 — when metrics say so

### 4. `getStats` aggregates in JS over every watched entry

`src/lib/tracking/queries.ts` → `getStats`

Now correct (it paginates — see `src/lib/supabase/paginate.ts`), but it reads
every row to compute sums: `ceil(n / 1000)` requests and the full table over
the wire. At 1498 rows that's 2 requests; at 20k it's 20 and megabytes of
egress per stats view.

Fix: a Postgres RPC doing `SUM`/`COUNT ... GROUP BY`. One query, no row cap,
almost no egress. The function's existing comment already anticipates this.
Needs a migration.

Same shape, same fix: `getPublicProfileCounts` sums `runtime_minutes` in JS.

### 5. `getLibraryCounts` is 7 queries for 4 numbers

Five counts, plus the two added to exclude finished titles from the watchlist
count. Foldable into one RPC, or into fewer queries with `GROUP BY status`.

### 6. `getPublicListsByUser` is an N+1

`src/lib/tracking/queries.ts` — two queries per list (count + cover posters).
Fine for a handful of lists, linear in list count. One grouped query, or accept
it and cap lists per profile.

### 7. `getTmdbIdMap` is an extra round-trip per grid

Every poster grid fetches rows, then makes a second query to map internal ids
back to TMDB ids. Denormalizing `tmdb_id` onto `media` would remove this call
from Library, Watched, Watchlist, Dropped, Tiers, and Stats. Needs a migration
and a decision about the indirection `AGENTS.md` deliberately introduced — the
mapping table exists for anime reconciliation, so denormalize as a *cache
column*, not a replacement.

### 8. Title page fires ~12-15 Supabase queries

`getShowProgress`, `isInWatchlist`, `getMyRating`, `isMovieWatched`,
`getUserWatchedEpisodeIds`, `getQuickTrackStates`, plus the `upsert*` lookups.
Several are single-row reads against the same user. Batchable into one RPC or a
couple of combined queries. Do #2 first — it removes most of the round-trips
without touching query structure.

### 9. `media_external_ids` primary key can collide

`(source, external_id)` is the PK, but TMDB numbers movies and TV separately —
movie 550 and show 550 are different titles that map to one row. Not a
performance item, but it's a latent correctness bug in the same file you'll be
touching for #7, so fix them together. `getQuickTrackStates` already keys on
type+id to work around it.

---

## P3 — later, or never

- **Discover pulls 2 TMDB pages per section** (~40 posters). If duration
  becomes a problem, consider 1 page plus an explicit "load more" — but this is
  a deliberate feature choice, so only revisit if it actually shows up in
  metrics. See the rule at the top.
- **`next/image` optimization** counts against Vercel's transform quota. TMDB
  already serves pre-sized posters (`w185`/`w342`/`w500`), so `unoptimized`
  on poster images is worth *measuring* — it may cut transform usage for no
  visual loss.
- **`ensureSeasonCached` on every title-page render** is idempotent and
  short-circuits on a cache hit, but it still costs 2 Supabase queries per
  view. Low value; listed for completeness.
- **Large `markEveryEpisodeWatched` inserts** — one statement with 1000+ rows
  for a long-running anime. Works today; chunk it if payload limits ever bite.

---

## Do NOT do these

- **Don't bulk-import the TMDB catalogue.** Violates their ToS and would blow
  the 500 MB database on its own. Cache-on-touch only (`src/lib/tmdb/upsert.ts`).
- **Don't cache TMDB responses in Postgres** to "save TMDB requests." That
  trades a free, already-deduped `fetch` cache for paid database rows and
  egress. Strictly worse. `watch_providers_cache` is the one justified
  exception (7-day TTL, small payload).
- **Don't remove the pagination in `fetchAllRows` to save requests.** It exists
  because PostgREST silently truncates at 1000 rows and produced wrong stats.
  Correctness first — fix the underlying query with an RPC instead (#4).
- **Don't cut features to hit a number.** Fewer recommendations, fewer posters,
  no franchise section — all the wrong trade. Optimize the query.

---

## Instrument before optimizing

None of the above should be actioned on a hunch. Cheapest useful signals:

1. **Supabase dashboard** — egress, database size, and the slow-query report.
   The slow-query list will surface #1 and #4 on its own.
2. **Query count per request in dev** — a counter wrapped around
   `createClient()` logging per-request totals would make regressions obvious.
   #1 and #2 are both invisible today because nothing counts.
3. **Vercel analytics** — function duration per route. Title page and Discover
   are the ones to watch; both block on TMDB.
4. **Set an alert well before the tier ceiling**, not at it. Egress overage is
   the failure mode that takes the app down without warning.
