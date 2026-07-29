# Design roadmap — Home & Discover

Planning doc for the two browse surfaces. Written 2026-07-30, after the Home
Continue-Watching rail landed.

## The decision: what is each surface *for*

You floated two options:

- **A** — Home gets limited carousels; Discover is the "see more" destination.
- **B** — Home stays as it is; Discover grows detailed sections (ratings,
  franchises, universes, directors, actors, must-watches, genre, mood).

**Recommendation: B, plus exactly one discovery rail on Home.** Not both
surfaces browsing.

Reasoning, in order of weight:

1. **`AGENTS.md` already decided this.** "Episode-resume tracking is the
   load-bearing feature — treat it as first-class in every data-model and UI
   decision," and Continue Watching was deliberately moved above the hero
   carousel. Home is the front door for a **returning** user; its job is
   *resumption*, not discovery. Stacking carousels on it dilutes the one thing
   that isn't Letterboxd or the TMDB website.
2. **Two browse surfaces means every future feature ships twice.** Genre rows,
   mood rows, franchise rows — each needs a Home treatment and a Discover
   treatment, forever. One engine, one place.
3. **v1 scope excludes taste-based recs.** A discovery-heavy Home implies
   personalisation we're explicitly not building yet. Trending-for-everyone on
   Home is honest; a wall of carousels implies "for you" and won't deliver.
4. **Cost asymmetry** (tiebreaker only — see the rule in `OPTIMIZATIONS.md`).
   Home is hit every session; Discover is entered deliberately. A carousel on
   Home multiplies its TMDB calls and function duration by session count. This
   is *not* a reason to cut a feature — it's a reason to put it on the surface
   where it earns its cost.

So: **Home = "your stuff" + one shallow hook. Discover = the browse engine.**

---

## Home

### Done

- Continue Watching rail — two rows, horizontally scrollable, cards clamped to
  one line per field. First thing on the page.

### Phase 1 — "your stuff" — **DONE**

All four sections shipped. Every one reads only our own tables; Home makes zero
TMDB calls.

| Section | Source as built | Note |
|---|---|---|
| **Stat strip** | `getMonthActivity()` | "This month · 1674 episodes · 20 movies · 956h", links to /stats. Sits *below* Continue Watching to keep the founding feature's top slot. |
| **Up next from your watchlist** | `getWatchlistItems()` | Rail. Hover Watched/Watchlist actions with **zero extra queries** — watchlist items are watchlisted-and-not-finished by definition, so the state map is built in-page. |
| **Recently watched** | `getRecentlyWatched()` | Rail, one entry per title. |
| **On this day** | `getOnThisDay()` | Rail. Hidden until an account has a year of history. |

Two things differed from the original plan, both for good reasons:

- **The stat strip does NOT reuse `getStats()`.** That function reads *every*
  watched entry (see `OPTIMIZATIONS.md` #4) and Home is the hottest route —
  putting it there is the exact anti-pattern that doc warns about.
  `getMonthActivity()` is scoped to the current month and selects two small
  columns. Same for **On this day**: rather than scan everything and match
  month/day in JS the way `getStats` does, `getOnThisDay()` ORs together one
  single-day range per prior year — one bounded round-trip. (PostgREST can't
  filter on `EXTRACT(MONTH FROM …)`; the `and()`/`or()` form was verified
  against the live DB.)
- **Recently watched is derived from `show_progress`, not `watched_entries`.**
  Ordering `watched_entries` by date and deduping does not work: marking a
  season writes hundreds of rows sharing one `watched_at`. Measured on real
  data, fetching 60 rows yielded **4** distinct titles. `show_progress` is
  already one row per show and its `status_changed_at` is bumped by every mark,
  so it *is* the per-show last-activity timestamp — deduped by construction.
  Movies come from `watched_entries WHERE episode_id IS NULL`. Two LIMIT-ed
  queries, merged. Returns a full 12 distinct titles reading fewer rows than
  the broken version.

Note `getStats().onThisDay` is now redundant with `getOnThisDay()` — fold it
into the RPC work in `OPTIMIZATIONS.md` #4 rather than keeping two
implementations.

### Phase 2 — the single discovery hook — **DONE (as a hero, not a rail)**

Shipped as the design handoff's **coverflow hero carousel at the top of Home**,
not the modest rail this doc originally proposed. That was a deliberate call by
the project owner, made after reading the recommendation below — recorded here so
the reasoning isn't lost:

- `AGENTS.md` has been updated to match. The old "Continue Watching goes FIRST"
  rule is reversed; **don't revert it.**
- The `Hey, @username` greeting was removed so the carousel owns the top.
- Continue Watching keeps the first *section* slot, immediately under the hero.

What was built (`HeroCarousel.tsx`): coverflow stack over a blurred wash sampled
from the centre poster's own art, title block with `Details` + `Watchlist`, dots,
desktop arrows, touch swipe, 4s auto-advance. Two columns from `lg` up (stack
left, details right) to save ~150px of vertical space; stacked on mobile.

**No type tabs.** A Trending / Movies / TV row was built and then removed at the
owner's call — "I don't want to replicate Netflix." The hero is a single
interleaved feed of 10 trending titles instead. Don't re-add them.

Cost is kept honest by fetching **page 1 only**, which is the identical URL
Discover already fetches — so the two share a single Next fetch-cache entry
instead of costing a call each. The wash layers reuse the same `w342` poster URLs
the cards render, so the colour backdrop adds no downloads.

**Motion is deliberate, not incidental** — cards move on a 0.9s ease-out and the
wash crossfades over 2.2s, both in `globals.css` (`.hero-card`, `.hero-wash`).
Cards must keep a stable React key and wrapper element across slide changes; key
them by position and they remount and snap instead of animating.

The cost that remains: Home now makes a TMDB call and one
`getQuickTrackStates` (4 queries, for the hero's watchlist buttons) on the
app's hottest route. Accepted deliberately — feature above usage. If Home's
duration becomes a problem, the fix is caching, not deleting the carousel.

**The standing constraint:** the hero is the *only* discovery surface on Home.
If Home feels thin, add another *"your stuff"* section — not another carousel.
Browse axes belong on Discover.

### Phase 3 — v1.5, once there's data

Personalised rows ("because you watched…"), new-episode-available flags. Both
are on the v1 **OUT** list in `AGENTS.md`; don't pull them forward.

### The empty-state ladder

Home has to be good at **0 / 1 / 20** shows. The 0 case is handled. The **1
show** case is the weakest today — one lonely card in a wide container. Phase 1
sections fix it; until then it's the known rough edge.

---

## Discover

Discover becomes the browse engine. Ordered by build cost against value.

### Done

Trending movies + shows, multi-page (~40 each), search, type filter, poster-size
toggle, hover Watched/Watchlist actions.

### The one structural decision that matters

Almost every row below is **the same TMDB endpoint with different query
params**: `/discover/movie` and `/discover/tv`.

Build **one** `discoverTitles(type, params)` in `src/lib/tmdb/client.ts` and
**one** reusable browse section component, and every row in Phase 1 becomes a
config object rather than new code. Get this wrong and you write eight
near-identical fetchers.

Reuse what already exists: `TrackablePosterGrid` (hover actions + fluid
sizing) and `PosterSizeShell` (`data-poster-size`). Any new section inherits
both for free.

Keep filters **URL-driven** (`/discover?genre=28&lang=hi&sort=rating`) so state
is shareable and bookmarkable — consistent with the zero-JS `SearchBar` and the
existing type pills.

### Phase 1 — cheap and high-value (all just `/discover` params)

| Row | TMDB | Gotcha |
|---|---|---|
| **By genre** | `/genre/{type}/list` for names, then `with_genres=` | Genre list is static enough to cache for a week. |
| **By rating** | `sort_by=vote_average.desc` + **`vote_count.gte=300`** | The `vote_count` floor is mandatory. Without it you get obscure titles with three 10/10 votes — this is exactly the bug that was already fixed once in `trendingInRegion`, which was sorting trending results by `vote_average`. |
| **Indian languages** | `with_original_language=hi\|ta\|te\|ml\|kn\|bn\|mr` | The strongest differentiator for the target audience, and it's one query param. Rows per language. |
| **On your streaming services** | `with_watch_providers=` + `watch_region=IN` | "What's on Netflix / Prime / Hotstar in India." Pairs with the provider data already cached in `watch_providers_cache`. |
| **By year / decade** | `primary_release_year`, or `.gte`/`.lte` ranges | Trivial once the shared fetcher exists. |

That's five browse axes for roughly one fetcher plus config.

### Phase 2 — needs real work

**Franchises / universes.** You asked for this specifically, so the constraint
matters: **TMDB has no endpoint to browse or list collections.** You can fetch
one by id (`/collection/{id}`, already wired up for title-page recommendations)
or hit `/search/collection`. There is no "all franchises" feed. So a browse-by-
franchise page needs **a curated list of collection ids stored on our side**.
Not hard — but it's editorial content, not an API integration, and it should be
scoped as such.

**People — directors & actors.** `/search/person`, then
`/person/{id}/combined_credits`. Straightforward, but it implies a new
`/person/[id]` page, which is a surface that doesn't exist yet. Medium effort.

**Must-watches.** No TMDB endpoint. Pure editorial.

**Mood.** No TMDB concept either. Best mapping is mood → genre + keyword
combos via `with_keywords` (`/search/keyword` to find ids). Editorial mapping
table, then it rides the Phase 1 fetcher.

> **The editorial three (franchises, must-watches, mood) need a content model —
> and we already have one.** `custom_lists` + `custom_list_items` exist, with
> `is_public` and RLS that lets anyone read public lists. An admin-owned account
> publishing curated public lists powers all three rows with **zero new
> schema**. Worth confirming before designing anything bespoke.

### Phase 3 — anime

AniList is in the locked stack (`src/lib/anilist/`) and currently unused.
Anime browse rows (season, format, popularity) are a separate integration, and
`media_external_ids` already exists precisely to reconcile AniList with TMDB.

### Layout convention

- **Rails** (horizontal, ~10-20 items) for Home and for Discover's landing page
  overview — one row per axis, each ending in `See all →`.
- **Grids** (`.poster-grid`, wrapping, paginated) for a drilled-into section
  like `/discover/genre/28`.

That gives Discover a shape: a landing page of rails, each opening into a full
grid. It also means Discover's landing page and Home's single rail share the
same component.

---

## Sequencing

1. Home Phase 1 — "your stuff" sections. Cheap, differentiated, fixes the
   1-show empty state.
2. Discover shared fetcher + browse section component. **The unlock** — do it
   before any individual row.
3. Discover Phase 1 rows, one at a time. Each is config once step 2 exists.
4. Home's single trending rail. After Discover has somewhere to send people.
5. Discover Phase 2 — decide the editorial content model first (probably
   `custom_lists`), then franchises → people → must-watch → mood.

## Cost notes

Read `OPTIMIZATIONS.md` before adding rows. Two rules that apply directly:

- Every Discover row is a TMDB call on a **dynamic** route. Rows are cheap
  individually and expensive in aggregate — add them deliberately, and lean on
  the per-endpoint `revalidate` values already set in `client.ts`.
- **Never cut a feature to save a request.** If a row is worth having, it's
  worth caching properly.
