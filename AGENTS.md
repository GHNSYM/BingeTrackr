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

## Home screen: Continue Watching goes FIRST

The design handoff put the hero carousel first. We overrode that. Continue Watching sits above the fold; the hero carousel comes second. Founding-feature respect.

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
│   ├── login, signup, onboarding
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

## Data conventions (from system design)

- **Single `watched_entries` table** with nullable `episode_id`. Movie watch = `episode_id IS NULL`. Denormalize `runtime_minutes` onto the row so hours-watched stats are a single `SUM`.
- **Separate `show_progress` table**, one row per (user, show). Don't derive resume-point from `MAX(watched_at)` — users need explicit control.
- **Internal `media.id`** (uuid) with `media_external_ids` mapping to TMDB / AniList / IMDb / MAL. Never use TMDB IDs directly — anime reconciliation depends on this indirection.
- **Cache TMDB lazily** — only mirror media the user touches. Do NOT bulk-import TMDB's catalog (violates ToS + kills the free tier).
- **RLS policies** use `is_public` on `profiles` (partial index) for cross-user reads. Writes are always `user_id = auth.uid()`.

Full schema + reasoning lives in the conversation that produced this project. Ask the user for it if you need to defend a decision.

## Working style

- **AI-accelerated, not AI-autopilot.** Every merged file must be defensible line-by-line. Schema design + RLS + hard architectural decisions are the user's; boilerplate + component scaffolds can be AI-generated.
- **Optimistic UI everywhere.** Mark-watched cannot wait for a round-trip. Use `useOptimistic`.
- **No spinners.** Skeleton screens for every load.
- **Test glassmorphism perf on a real ₹15-20k Android before shipping.** The `prefers-reduced-transparency` fallback is not enough by itself.

## Environment

Copy `.env.local.example` → `.env.local` and fill in the Supabase + TMDB values. The middleware will fail-open on the landing page without them but any authed route requires the Supabase URL + anon key.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — ESLint

## Memory

Longer-lived project context (business framing, competitor notes, decisions made across sessions) lives at:
`C:\Users\ghans\.claude\projects\C--Users-ghans-Desktop-New-App\memory\`
