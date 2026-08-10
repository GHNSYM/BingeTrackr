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

### 1. `getContinueWatching` pulls every episode of every show — **DONE 2026-08-01**

`src/lib/tracking/queries.ts` → `getContinueWatching`, now a single
`get_continue_watching` RPC call
(`20260731120003_continue_watching_rpc.sql`).

**Measured, same data, same 5 shows: 8 queries and 171 episode rows → 1 query
and 0 episode rows over the wire.** Output byte-identical to the old
implementation, compared field by field including the `next` episode object.

**Chosen: the RPC, not a denormalized `show_progress.next_episode_id`.** The
deciding argument, in full in the migration header: the next episode is derived
from the resume pointer *and* the episode catalogue, and the catalogue moves on
its own — `ensureSeasonCached` fills seasons lazily and new seasons air. A stored
pointer computed while S2 was uncached would say "all caught up" forever, with
nothing to recompute it when S2 later arrives via an unrelated title-page visit.
That is a silent failure of the founding feature. The pointer also had 6+ writers
to keep honest, and still needed the episodes join for name/runtime anyway.

The trick is a row-constructor comparison —
`(s.season_number, e.episode_number) > (sp.current_season, sp.current_episode)`
— which expresses "first episode after the resume point" natively. One expression
replaced the fetch-everything-sort-then-find.

**The denormalized sort key on `episodes` from the original write-up was
deliberately NOT added.** It only existed to work around PostgREST's inability to
order on an embedded column, and the RPC dissolves that constraint. A composite
integer key (`season * 1000 + episode`) would also break on any season past 1000
episodes — a real risk in a codebase that already handles 1100+-episode anime and
carries scars from the 1000-row cap. Existing indexes
(`seasons unique (media_id, season_number)`, `episodes_season_idx`) already serve
the lateral; if it ever profiles slow, add an index, not a column.

### 2. `auth.getUser()` is called 6× per title-page render — **DONE 2026-07-31**

Every query helper independently called `createClient()` then
`supabase.auth.getUser()`. **`getUser()` is a network round-trip** — it
validates the JWT against Supabase Auth rather than reading it locally.

Fixed as planned: `getCurrentUser()` in **`src/lib/auth/current-user.ts`**,
wrapped in React's `cache()`, is now the single primitive every auth read goes
through — including `getUserAndProfile` and `requireUser`, which previously had
their own `getUser()` call. So a layout + page + N helpers cost one round-trip
between them, not one each.

All 34 call sites in `tracking/queries.ts`, `tracking/actions.ts`,
`tracking/quick-actions.ts`, `tmdb/seasons.ts`, `auth/actions.ts`, the title
page and the public profile page now route through it. **Only `proxy.ts` calls
`getUser()` directly** — that one is the middleware session refresh and must
stay. Treat that as the invariant: if a new `auth.getUser()` appears anywhere
else, it's a regression.

Three files (`seasons.ts`, the title page, the profile page) were creating a
Supabase client *solely* to call `getUser()`; those clients and their imports
are gone.

**Measured** with a temporary probe page calling 7 helpers in one render:
**7 round-trips before, 1 after**, and 1 per request across repeated requests
(so the memoisation is per-request, not leaking between users).

Note the win is bigger than the "6" in the title: the count scales with how many
helpers a route calls, so Library and Tiers benefit too.

### 3. Quick actions hit TMDB even when the title is already cached — **DONE 2026-07-31**

`src/lib/tracking/quick-actions.ts` → `resolveMediaId`

Every Watched/Watchlist click on a poster called `getMovie`/`getTv` purely to
resolve a TMDB id to our internal `media.id`, even when `media_external_ids`
already had the mapping.

Fixed: `resolveMediaId` now reads `media_external_ids` first and returns on a
hit, falling through to the TMDB fetch + `upsertMedia` only for genuinely new
titles. The common path loses one TMDB round-trip **and** the `media` UPDATE
that `upsertMedia` does on every touch, at the cost of one indexed single-row
read. `media` and `media_external_ids` are both world-readable, so this needs no
admin client.

Originally this needed a post-hoc `media.type` check, because #9 meant
`(source, external_id)` could point at a movie when the caller asked about a
show. **#9 is now fixed in the schema, so that guard is gone rather than merely
working**: `media_type` is part of the primary key, making this a single indexed
lookup that cannot return a row of the wrong type, and the join to `media`
disappeared with it.

Verified against the live DB: a cached id returns its `media_id`; an uncached id
returns `null` cleanly and falls through to TMDB.

---

### 12. Vercel Image Optimization hit 75% of the free-tier monthly quota — **DONE 2026-08-04**

Vercel's Hobby plan includes 5,000 Image Optimization **transformations**/month
— one per unique `(source URL, width bucket, format)` `next/image` ever
requests, cached after that. The alert came at 75% (3,750/5,000) via email, not
a metric we were watching; this is the "metric said so" this doc's rule asks
for, upgrading the speculative P3 bullet below into a real fix.

**Not a bug in any one place — a shape of the app.** BingeTrackr deliberately
surfaces a large, ever-shifting slice of TMDB's catalogue (Discover's
genre/language/provider/decade axes, free-text search, any title page a visitor
or crawler lands on), and usage scales with how many *distinct* titles get
shown, not with total traffic. That's the intended feature, not the thing to
cut — see the rule at the top of this doc.

Two real, zero-downside-to-the-feature wastes did exist in `next.config.ts`'s
`images` block, both left at Next's defaults:

- **`deviceSizes` included 2048 and 3840.** Every image in the app is fetched
  from TMDB pre-sized at `w185`–`w1280` (`posterUrl`/`backdropUrl`,
  `lib/tmdb/client.ts`) — nothing is ever wider than 1280px. Generating a
  2048px or 3840px variant of a 1280px source is a pure-upscale transformation:
  it gets counted and cached, and it can never look sharper than the original.
  The title page's full-bleed backdrop (`sizes="100vw"`) was the one place this
  actually fired, since it's the only `fill` image wide enough to request the
  top buckets. Fixed: `deviceSizes: [640, 750, 828, 1080, 1200, 1920]`.
- **`minimumCacheTTL` defaulted to 4 hours.** A TMDB image path is immutable —
  the same URL never points at different pixels — so there's no correctness
  reason to ever let a cached transformation expire and force a re-transform
  (which re-spends a transformation credit for pixels already optimized once).
  4h is tuned for content that changes; TMDB posters don't. Fixed:
  `minimumCacheTTL: 31536000` (1 year).

Landing page's `TitleShowcase`/`PhoneMockup` marquee (real TMDB posters, added
2026-08-03) also had a stale header comment claiming "zero fetches" — corrected
in `(marketing)/page.tsx`, since that route is the highest-traffic page in the
app and now genuinely spends part of this budget every 6h revalidate.

**Not done, and deliberately not the first move:** the P3 bullet below about
`unoptimized` posters. Config tuning captures the free win without touching a
single visual or feature; only reach for `unoptimized` if usage keeps climbing
after this — see Instrument before optimizing at the bottom of this doc.

---

## Migrations applied — 2026-08-01

All four 2026-07-31 migrations are **applied and their TypeScript is rewired**.
Verified against the live database after apply:

| Migration | Item | Verified |
|---|---|---|
| `…0001_media_external_ids_type.sql` | #9 | 90 rows backfilled, 0 null `media_type`, 0 disagreeing with `media.type`; movie+show may now share a TMDB id; a mismatched `media_type` is rejected by the composite FK |
| `…0002_media_tmdb_id_cache.sql` | #7 | backfill exact; trigger fires correctly on INSERT and on DELETE |
| `…0003_continue_watching_rpc.sql` | #1 | 8 queries/171 rows → 1 query/0 rows, output identical |
| `…0004_stats_rpcs.sql` | #4 | every figure matches the old JS aggregation for both accounts, including top-shows ordering |

Two notes for whoever reads this next:

- **`media_external_ids.media_type` is NOT NULL with a composite FK to
  `media(id, type)`.** Any new insert must supply it and it must agree with the
  media row. `upsertMedia` does; hand-written inserts won't.
- **`media.tmdb_id` is trigger-maintained.** Never write it directly —
  `media_external_ids` is still the source of truth. To read a TMDB id, add
  `tmdb_id` to the `media` join you are already doing.

## P2 — when metrics say so

### 4. `getStats` aggregates in JS over every watched entry — **DONE 2026-08-01**

`getStats` now makes **three RPC calls** instead of reading every watched entry
with a media join and aggregating in JS. `getPublicProfileCounts` is **one call**
instead of four queries plus a paginated read of the whole runtime column.

`get_on_this_day` replaced **two** implementations: `getOnThisDay()` and the
redundant `getStats().onThisDay` flagged in `DESIGN_ROADMAP.md`. It also removed
the OR'd-one-day-range-per-prior-year hack that existed because PostgREST cannot
filter on `EXTRACT(MONTH FROM …)` — in SQL that is just a predicate, and the
one-row-per-title de-dupe is a window function rather than a JS loop. The
`yearsBack` parameter is gone; it only ever existed to bound the OR clauses.

**Verified** for both accounts against the old JS aggregation: all nine totals
identical (e.g. `total_minutes: 70782`, `episodes_watched: 1942`,
`shows_completed: 25`), top-shows lists identical including order, profile counts
identical. `get_on_this_day` was additionally verified by seeding a watch dated
exactly one year ago: it came back with `years_ago: 1`, `is_episode: false` and a
populated `tmdb_id`; the seed row was removed afterwards.

**Timezone caveat, deliberately preserved.** The RPCs take `p_tz` defaulting to
`'UTC'`, which is what `new Date()` on a Vercel function did. For an India-first
product, "this year" and "on this day" arguably belong in `Asia/Kolkata` — that
is a product decision, so it is a parameter rather than a silent behaviour
change. Flip it by passing `p_tz` from the callers.

### 5. `getLibraryCounts` is 7 queries for 4 numbers — **DONE 2026-07-31**

Now **4 queries**, no migration needed.

`GROUP BY status` turned out to be unavailable: PostgREST rejects aggregate
selects on this project ("Use of aggregate functions is not allowed", verified
against the live API), so `select=status,count()` is out. Instead the three
`head: true` counts against `show_progress` collapsed into one read of
`(media_id, status)` tallied in JS — that table is one row per (user, show), so
it's inherently small and two narrow columns beat three round-trips.

That read also *is* the completed-shows set, which is half of what
`getFinishedMediaIds` computes, so the watchlist exclusion dropped from two
queries to one.

Both list reads are now paginated via `fetchAllRows`. They weren't before — a
user tracking or watchlisting >1000 titles would have silently got a wrong badge.

**Verified** against both real accounts: counts identical before and after
(`{watching:5, watched:47, watchlist:23, dropped:2}` and
`{0, 3, 1, 0}`).

### 6. `getPublicListsByUser` is an N+1 — **DONE 2026-07-31**

Now **2 queries** regardless of list count, no migration needed. Items for every
list come back in one read scoped to those list ids; per-list count and the first
four cover posters are derived from it.

The trade: `itemCount` is a JS tally rather than a server-side `head: true`,
because a grouped count would need an RPC (aggregates blocked, as in #5). Reading
the rows is cheaper at list sizes a human curates, and it's paginated so a large
list costs extra requests rather than a wrong number.

**Verified** with two throwaway public lists of different sizes, positions
inserted in reverse to exercise the ordering path: identical counts and identical
cover-poster arrays, 5 queries → 2. Temp data cleaned up.

### 7. `getTmdbIdMap` is an extra round-trip per grid — **DONE 2026-08-01**

`getTmdbIdMap` is **deleted**. Every caller now reads `media.tmdb_id` off the
media join it was already doing, removing one round-trip from Library, Watched,
Watchlist, Dropped, Tiers, Stats, Recently-watched, On-this-day and Continue
Watching. `markEveryEpisodeWatched` also stopped querying `media_external_ids`
for the show's TMDB id.

Denormalized as a **cache column, not a replacement** — `media_external_ids`
remains the source of truth for the indirection `AGENTS.md` introduced for anime
reconciliation. It is trigger-maintained rather than application-maintained,
which is what makes it safe: exactly one writer, and that writer is the database.

`getQuickTrackStates` still reads `media_external_ids` directly, correctly — it
maps many TMDB ids to media ids, which is that table's actual job. It no longer
needs the `media` join, though, since `media_type` lives on the row now.

### 11. Discover's landing is 8 TMDB calls and 1 whole-library read — **BY DESIGN, 2026-08-01**

Not a backlog item — recorded so nobody "optimizes" it without the reasoning.

The browse engine's landing renders two trending grids, a chip block, and five
browse rails. That's **8 TMDB calls** (2 trending + 5 rails + 1 genre list) where
it used to be 4. It is cheaper than it looks, and the shape is deliberate:

- **Wall-clock is the slowest call, not the sum.** Every section is an async
  server component inside its own `<Suspense>`, so they run concurrently and the
  page paints before any of them land. Measured warm: TTFB ~250-310ms, full
  document 540-800ms with all eight resolved.
- **Trending dropped from 2 pages to 1.** Both remaining URLs are byte-identical
  to what Home's hero already fetches, so Home and Discover now share fetch-cache
  entries instead of each paying. Net new cost is 5 calls, not 8.
- **6h `revalidate`** on `/discover` (`discoverTitles`) and **7d** on the genre
  list. One visitor per window pays; everyone else hits the cache.
- **Supabase is 4 queries, flat.** Seven rails needing hover state would be 4×7 =
  28 with the batched `getQuickTrackStates`. `getAllTrackStates()` is `cache()`d,
  so the first rail pays and the rest are memo hits — and crucially that keeps the
  streaming, whereas collecting ids up front would force every rail to resolve
  before any could render.

The lever if this ever hurts is the rail count, and the config makes it a
one-line deletion. Prefer moving an axis into the "Browse by" chip row — a chip
costs nothing and the genre list is already fetched.

### 10. `getRecentActivity` reads a 400-row window to build 12 grouped rows

`src/lib/tracking/queries.ts` → `getRecentActivity`

The public profile feed groups consecutive episodes of the same show into one row
("S1 · E1–E6"). Ungrouped it was unusable: measured on real data, the old 12-row
feed contained **1** distinct title — twelve episodes of The Winchesters, because
marking a season writes every row with the same `watched_at`.

Grouping happens in JS over a bounded 400-row window, because PostgREST has
aggregates disabled on this project and cannot `DISTINCT`, so "the last N shows"
isn't expressible over REST. It's one request and it's capped, but it's still
reading ~400 rows with two joins to render twelve lines, and a single huge binge
can fill the whole window and yield fewer than `limit` groups.

Fix when it matters: an RPC using a gaps-and-islands window function
(`row_number() - dense_rank()` over `media_id` ordered by `watched_at`) to
collapse runs server-side, returning `min`/`max` season+episode and a count per
group. Then the read is twelve rows. Not urgent — the profile is a deliberate
visit, not a hot route.

### 8. Title page fires ~12-15 Supabase queries — **PARTLY OVERTAKEN**

`getShowProgress`, `isInWatchlist`, `getMyRating`, `isMovieWatched`,
`getUserWatchedEpisodeIds`, `getQuickTrackStates`, plus the `upsert*` lookups.
Several are single-row reads against the same user. Batchable into one RPC or a
couple of combined queries.

#2 is done, which already removed the auth round-trips this item was mostly
about. What's left is the genuine per-table reads — re-measure before deciding
it's still worth an RPC.

### 9. `media_external_ids` primary key can collide — **DONE 2026-08-01**

**This was a live correctness bug, not a performance item.** `(source,
external_id)` was the PK, but TMDB numbers movies and TV separately — movie 550
and show 550 are different titles that collided on one row, so `upsertMedia`
would update the wrong title's `media` record and return the wrong `media_id`.

Fixed: the PK is now `(source, external_id, media_type)`, with `media_type`
denormalized from `media.type` and held honest by a composite FK to
`media(id, type)` (`on update cascade`, `on delete cascade`). The database
enforces agreement; there is no application invariant to forget.

Denormalizing here is safe for a reason worth keeping straight: `media.type` is
**immutable in practice** — a title does not become a different kind of thing.
That is precisely why the derived-and-changing `next_episode_id` in #1 was
rejected while this was accepted.

Both work-arounds are gone: `resolveMediaId` does a direct PK lookup, and
`getQuickTrackStates` reads `media_type` off the row instead of joining `media`.
`upsertMedia` writes `media_type` on insert and filters on it when checking for
an existing mapping.

**Verified** post-apply: a movie and a show can now hold the same TMDB id, and an
insert whose `media_type` disagrees with its media row is rejected by the FK.

**One side effect, found by running every query shape after the apply.**
PostgREST derives embeds from foreign keys, so swapping the single-column FK for
a composite one *removes* the ability to embed `media` from this table:

```
.from("media_external_ids").select("media_id, media:media_id ( type )")
→ Could not find a relationship between 'media_external_ids' and 'media_id'
```

Harmless as it stands — the only query doing that was `getQuickTrackStates`,
which embedded `media` purely to read `type` and now reads `media_type` off the
row. But note the dependency: **had that rewiring not happened, this migration
would have broken poster hover state.** If you need media columns beside a
mapping row in future, use a second query or an RPC. Don't restore the
single-column FK — it's what allowed the collision.

---

## P3 — later, or never

- **Discover pulls 2 TMDB pages per section** (~40 posters). If duration
  becomes a problem, consider 1 page plus an explicit "load more" — but this is
  a deliberate feature choice, so only revisit if it actually shows up in
  metrics. See the rule at the top.
- **`unoptimized` on poster images**, to skip Vercel's optimizer entirely since
  TMDB already serves pre-sized posters. Downgraded from "worth measuring" to
  "actually still open" by #12 above, once the quota alert made it worth
  measuring for real — the config-level fixes there (capped `deviceSizes`, a
  1-year `minimumCacheTTL`) were the free win and came first. Revisit
  `unoptimized` only if usage climbs again after those land; it costs the
  automatic AVIF/WebP conversion and responsive srcset, which `deviceSizes`
  tuning doesn't.
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
