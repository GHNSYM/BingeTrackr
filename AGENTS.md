<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.x) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BingeTrackr

Mobile-first web app for tracking movies, TV shows, and anime. Indian audience. Tagline: **"Never lose your place again."** The founding pain: users forget which season/episode they're on and rewatch entire seasons. Episode-resume tracking is the load-bearing feature — treat it as first-class in every data-model and UI decision.

## Stack (locked)

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind 4** (uses `@theme` blocks, no `tailwind.config.*` file)
- **Supabase** — Postgres, Auth, RLS, Storage. Free tier first.
- **shadcn/ui** v4 (Base UI + tw-animate-css) — components in `src/components/ui/`
- **TMDB** for movies/TV + JustWatch providers (region=IN). **AniList GraphQL** for anime (no key needed).
- **Vercel** hosts. Vercel Cron for background jobs.

## v1 scope (ship in 8-12 weeks)

**IN:** Auth, Onboarding, Home, Library, Discover, Title Detail (movie + TV/anime), Tiers, Public Profile, Stats, Settings.

**OUT — do NOT build in v1:** Friends, Follows, Notifications, Recommend-to-friend, activity feed, new-episode alerts, taste-based recs, import pipelines, "now available" alerts, group/couples lists, Year Wrapped. All social ships in v1.5 after ≥10 real users on v1.

## Design system (locked)

**Monochrome grey/black/white glassmorphic.** Color lives ONLY on poster art, tier bands, and profile banners — never on chrome. White is the single primary action color. Two themes: dark (default) + light.

- Tokens live in `src/app/globals.css` — both shadcn-named (`--background`, `--primary`, ...) and design-handoff-named aliases (`--bg`, `--surface`, `--body`, `--meta`) exist. Prefer shadcn names when using shadcn components; use the handoff aliases when porting screens directly from `../design_handoff_trackr/`.
- **Status hue exception:** we added subtle hues per status (`--status-watching/completed/paused/dropped`) so users can scan the Library at a glance. This is a deliberate divergence from pure monochrome — do NOT expand it to other chrome.
- Fonts: **Manrope** (display) + **Inter** (body) via `next/font`.
- Motion: `.animate-pop` for the signature Mark-Watched check, `.skeleton` shimmer for loads. Both respect `prefers-reduced-motion`. Glass surfaces drop to flat on `prefers-reduced-transparency` (perf mitigation for cheap Android — a real concern for the Indian audience).

## Roadmap

`DESIGN_ROADMAP.md` holds the plan for Home and Discover, and the decision
behind it: **Home is "your stuff" + one shallow discovery hook; Discover is the
browse engine.** Don't add browse carousels to Home — read that doc first.

## Home screen order: hero carousel, then Continue Watching

**This reverses an earlier decision — do not "fix" it back.** We originally
overrode the design handoff to put Continue Watching first. As of 2026-07-30 the
handoff's order stands: the hero coverflow carousel is the top of Home, then
Continue Watching, then the "your stuff" rails. The `Hey, @username` greeting is
gone — the carousel owns the top of the page.

Continue Watching is still the founding feature and still above the fold on
desktop. It keeps the first *section* slot, and the hero deliberately carries
only trending titles — Home does not grow more browse carousels. See
`DESIGN_ROADMAP.md`.

## Landing page: the handoff sells features we don't have

`src/app/(marketing)/page.tsx` deliberately **diverges from the handoff's
landing screen**, and the divergence is not a gap to close:

- The handoff's 5-feature list includes **Recommend to friends**, and its
  showcase band is half a **"From a friend"** recommendation card. Both are on
  the v1 OUT list above. The page ships **four** features and a stats card
  instead. Don't port the social copy back before the social feature exists —
  the root `metadata.description` was also scrubbed of "swap recommendations
  with friends" for the same reason.
- The handoff's **testimonial card is a fabricated quote**. It's omitted until
  there are real users to quote.
- **Colour IS allowed on the landing page, and only there.** The
  monochrome-chrome rule governs the *app*; `/` is a marketing surface. Accent
  colour comes from `--grad-1/2/3` (surfaces), `--gradt-1/2/3` (text) and
  `--tint-1/2` (washes) in `globals.css`. Every stop is lifted from a palette
  the handoff already sanctions — tier-S gold, tier-A ember, Rosé banner — so
  it isn't a new palette. **Do not carry these tokens into the app shell.**
  Two contrast constraints are load-bearing:
  - Gradient *surfaces* use `--grad-ink` (near-black) for text, not white.
    White clears AA on the ember and rosé stops but hits ~2.1:1 on amber, so it
    fails at the light end of every button.
  - Gradient *text* needs separate, darker stops in the light theme
    (`--gradt-*`); the vivid surface stops sit at ~1.5:1 on pale paper. That's
    why there are two sets rather than one.
- The page is **static with almost no JS** — the only client components are
  `ThemeToggle` and `ScrollToLink`; there are no fetches, so it stays the only
  `○` route in the build. Scroll choreography is CSS `animation-timeline` +
  `position: sticky`, each scroll rule gated behind `@supports` **and**
  `prefers-reduced-motion`, with the un-animated state being the *finished*
  state. Don't add an IntersectionObserver, and don't write a
  `.reveal { opacity: 0 }` default — that hides content in Firefox.
- **The `#why` / `#free` jump links go through `ScrollToLink`, not a plain
  `<a href="#why">`.** A native hash anchor only smooth-scrolls on the FIRST
  click — clicking it again when the URL already has that hash produces no
  `hashchange` event, so nothing re-fires, and the second click is a silent
  no-op. `ScrollToLink` calls `scrollIntoView()` manually on every click
  instead, so it works every time. It still renders a real `href="#…"` `<a>`
  underneath for right-click/no-JS fallback.
- **Two CSS traps are documented in `globals.css`; read them before editing it.**
  (1) `overflow: hidden` on an ancestor makes it a scroll container and silently
  freezes every `view()`-driven animation inside — this is why the landing
  sections don't clip, and why nothing animated goes inside `.marquee-row`.
  (2) `animation-range: entry …` lasts only as long as the element's own height,
  so it's useless on short elements (a 12px underline drew over 12px of scroll);
  the reveals and scribbles use `cover` ranges instead.
- **Theme:** `dark` is the default and is emitted on `<html>` by the server. A
  small inline script in the root layout removes it before first paint if the
  user saved `theme: light`, so dark users see no flash and there's no
  hydration mismatch. `ThemeToggle` flips the class and writes localStorage.
- Signed-in visitors are redirected `/` → `/home` **in `src/proxy.ts`**, which
  already has the user. Doing it in the page would read cookies and make `/`
  dynamic. The proxy deliberately does not check onboarding state — `(app)`'s
  layout owns that guard.

## Design handoff

Source-of-truth reference lives at `C:\Users\ghans\Desktop\BingeTrackr\design_handoff_trackr\`. The `.dc.html` files use a custom prototyping runtime — read the JSX-equivalent structure, do NOT port the `{{ }}` templating syntax literally. Rebuild each component in real React with shadcn/Tailwind.

Components to build (design-system order):
`PosterCard` → `ContinueWatchingCard` → `EpisodeRow` → `ProgressBar` → `WhereToWatchChip` → `StatusPill` (with hue) → `RatingDisplay` → `ActivityRow` → `EmptyState` → `LoadingSkeleton` → `BottomSheet` (mobile) / `Dialog` (desktop).

## Folder structure

```
src/
├── app/
│   ├── (marketing)/       public landing (this file's `page.tsx` is the root landing)
│   ├── (app)/             authed shell (home, library, discover, lists, stats, tiers, settings)
│   ├── u/[username]/      public profile — SSR for OG previews
│   ├── title/[type]/[id]/ public title page — SEO
│   ├── login, signup, onboarding, forgot-password, reset-password
│   └── api/cron/          Vercel Cron endpoints (protected by CRON_SECRET)
├── components/
│   ├── ui/                shadcn primitives (do not hand-edit)
│   └── trackr/            our design-system components
├── lib/
│   ├── supabase/          client.ts (browser), server.ts (RSC/actions)
│   ├── tmdb/              catalogue fetch + cache
│   └── anilist/           anime fetch
├── types/
└── middleware.ts          refreshes Supabase auth session per request — do NOT remove
```

## Data conventions

The full schema lives in `supabase/migrations/` — read those files as source of truth, not this summary. Key invariants:

- **Single `watched_entries` table** with nullable `episode_id`. Movie watch = `episode_id IS NULL`. `runtime_minutes` is denormalized onto the row so hours-watched stats are a single `SUM` with no joins.
- **Separate `show_progress` table**, one row per (user, show). Don't derive resume-point from `MAX(watched_at)` — users need explicit control (they jump around, mark random eps).
- **Internal `media.id`** (uuid) with `media_external_ids` mapping to TMDB / AniList / IMDb / MAL. Never use TMDB IDs as primary keys — anime reconciliation depends on this indirection. That table is keyed `(source, external_id, media_type)`: TMDB numbers movies and shows separately, so the type is part of the identity, and a composite FK to `media(id, type)` keeps the denormalized copy honest. `media.tmdb_id` is a **trigger-maintained cache** of the TMDB mapping so grids don't need a second round-trip — read it from the `media` join, never write it.
- **Cache TMDB lazily** — only insert `media` rows for titles users have touched. Do NOT bulk-import TMDB's catalog (violates ToS + kills the free tier).
- **PostgREST silently truncates reads at 1000 rows** (`db-max-rows`). It does not error — you just get 1000 rows and no signal there were more. This produced wrong stats (a user with 1490 watched entries had hours and per-show counts computed from an arbitrary 1000 of them). Any query that can return more than a few hundred rows MUST go through `fetchAllRows` in `src/lib/supabase/paginate.ts`, with a stable `.order()` on a unique column. Note `count: "exact", head: true` is unaffected — PostgREST computes counts server-side.
- **RLS pattern:** owner always reads/writes own; user-content tables (watched, show_progress, ratings, tiers, public custom_lists) are readable by anyone if the user's profile `is_public`. **Watchlist is owner-only-read even on public profiles** — deliberate privacy call.
- **Watched and watchlisted are mutually exclusive, and it's enforced in BOTH directions.** Finishing something evicts it from the watchlist (`dropFromWatchlist`); adding a *finished* title to the watchlist is refused (`toggleWatchlistAction` returns `already-watched`). "Finished" means a watched movie or a series set to `completed` — a half-watched series legitimately stays on the watchlist. This was one-directional until 2026-08-01, which let the DB hold both while `getWatchlistItems` hid the row at read time, so the poster buttons lit up both. Don't re-open that gap: enforce writes, don't paper over it on read.
- **Auto-profile trigger** on `auth.users` insert creates a `profiles` row with a placeholder `username` (e.g. `useraf12b8c9`). Onboarding lets the user claim a real handle.

## Migrations

See `supabase/README.md` for apply instructions. First migration goes via the SQL editor for speed; second onwards should go through the Supabase CLI so schema stays version-controlled.

Never edit an applied migration file — write a new one that reverses/extends it.

## TMDB `/discover` — never build params by hand

Every browse row goes through `discoverTitles` / `discoverTitlesPage` in
`src/lib/tmdb/client.ts`, configured from `src/lib/discover/axes.ts`. Do not call
`/discover/*` directly, and do not add a query param outside `DiscoverParams`.

The reason is that **TMDB silently ignores unknown params and returns 200** — a
typo doesn't fail, it widens the row to the entire catalogue and still looks like
a working feature. Three things it hides:

- **The date and sort keys differ by type.** `primary_release_date` for movies,
  `first_air_date` for TV. `primary_release_year` on `/discover/tv` is accepted
  and ignored.
- **Genre ids are not shared between movie and TV.** Movie `28 Action` has no TV
  equivalent (`10759 Action & Adventure`).
- **`sort_by=vote_average.desc` is unusable without a `vote_count.gte` floor**,
  and the right floor depends on how narrow the query is — see
  `LANGUAGE_RATING_FLOOR` in `axes.ts`, which carries the measurements. A flat
  floor either buries the canon under 1-vote titles or empties smaller-language
  rows entirely.

Provider ids are region- and merger-sensitive (Disney+ Hotstar 122 is gone; IN
uses JioHotstar 2336). Re-derive from `/watch/providers/movie?watch_region=IN`
rather than guessing — a wrong id returns an empty row, not an error.

## Free-tier budget

Deferred performance work lives in `OPTIMIZATIONS.md` — ranked, with measured
baselines. Read it before "optimizing" anything, and add to it rather than
acting on a hunch. The governing rule there: **feature above usage** — never cut
a feature to save a request; fix the query instead.

## Working style

- **AI-accelerated, not AI-autopilot.** Every merged file must be defensible line-by-line. Schema design + RLS + hard architectural decisions are the user's; boilerplate + component scaffolds can be AI-generated.
- **Optimistic UI everywhere.** Mark-watched cannot wait for a round-trip. Use `useOptimistic`.
- **No spinners.** Skeleton screens for every load. Primitives live in `src/components/trackr/LoadingSkeleton.tsx`; every dynamic route has a `loading.tsx` built from them. A skeleton must occupy the same box as the content it replaces — one that reflows on swap is worse than none.
- **Navigation must acknowledge the click instantly.** Every dynamic route needs a `loading.tsx`, and slow sections stream behind `<Suspense>`. The rule on a page like `title/[type]/[id]`: an `await` at the top level delays the hero for every visitor, so if data isn't needed to render the hero, it belongs in a child component behind a Suspense boundary. Read the comment at the top of that page before adding one.
- **A page of N independent sections is N async server components, not N awaits.** Discover's landing is the reference: each section fetches its own data inside its own boundary, so wall-clock is the slowest call rather than the sum. When those sections all need the same per-user data, wrap the reader in `cache()` (`getAllTrackStates`) — hoisting the fetch into the page to share it would force every section to resolve before any could render, which is the thing streaming exists to avoid.
- **Test glassmorphism perf on a real ₹15-20k Android before shipping.** The `prefers-reduced-transparency` fallback is not enough by itself.

## Environment

Copy `.env.local.example` → `.env.local` and fill in the Supabase + TMDB values. The middleware will fail-open on the landing page without them but any authed route requires the Supabase URL + anon key.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — ESLint

## Memory

Longer-lived context that *isn't* derivable from this repo (business framing,
portfolio goals, why the design direction was chosen) lives at:
`C:\Users\ghans\.claude\projects\c--Users-ghans-Desktop-BingeTrackr\memory\`

It used to point at a `...Desktop-New-App\memory\` directory from when the
project folder had a different name. That path is dead — its contents were
migrated on 2026-07-31 and the stale copies deleted. They had drifted badly
(claimed Next.js 15, TanStack Query, and the pre-reversal
Continue-Watching-first Home order), which is the argument for keeping technical
facts in this file and out of memory.
