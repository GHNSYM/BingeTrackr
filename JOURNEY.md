# The BingeTrackr journey

This is the story doc, not the reference doc. `AGENTS.md`, `DESIGN_ROADMAP.md`
and `OPTIMIZATIONS.md` are the technical source of truth — what's built, why,
and the exact fix for a given problem. This file is different on purpose: it's
the chronology and the *lessons*, especially the "I didn't see that coming"
ones, written down while they're still fresh instead of trusted to memory.

Two reasons this exists:

1. **Scaling lessons compound.** The Vercel Image Optimization quota hit
   (2026-08-11, below) is the first one that came from a monitoring email
   instead of from reading a doc — a preview of what production incidents
   actually feel like. Writing down not just the fix but *what it felt like
   to hit it* is the only way that instinct gets built before real users are
   depending on it.
2. **This is portfolio raw material.** The plan was always to write
   engineering posts about the hard problems (see the business framing —
   this isn't chasing venture scale, it's a resume project built to withstand
   an interviewer asking "why"). A post written from memory six months later
   is worse than one written from this file.

**How to keep this going:** add a new dated entry under the current phase (or
start a new phase heading) whenever something forces a real decision — a bug
that took real effort to root-cause, a free-tier limit that got hit, a design
call that got reversed. Skip routine feature work; that's what the other docs
are for. If it didn't teach you something you'd tell another developer, it
doesn't belong here.

---

## Phase 0 — Why this exists at all

Before any code: this app is built from a real, personal, recurring
annoyance — going back to a show and rewatching 10-15 episodes before
anything feels unfamiliar again. As a kid the fix was a self-maintained,
hand-renamed folder of downloaded films — you always knew exactly where you
were. Streaming replaced that, briefly wonderfully, until the real economics
of it hit: nobody can afford every subscription, so you borrow logins, watch
across accounts that don't talk to each other, and lose the plot again. Worse
than before, because now it's scattered across five apps instead of one
folder.

That's the founding pain, and it's why episode-resume tracking is treated as
the load-bearing feature in every schema and UI decision from day one — it's
not a guessed market need, it's the thing that was personally missing for
years before this got built.

The business framing was decided early and explicitly: this is not chasing
venture scale. Sustainable side project, $1000/mo MRR would be a stretch
goal — not the point. The actual bar is a portfolio piece good enough that an
interviewer can't tell whether it was hand-crafted or AI-assisted, because
every architectural decision can be defended. That bar is *why* schema
design, RLS policies, and hard architectural calls stayed with the owner
throughout rather than being delegated outright — see the working-style note
in `AGENTS.md`.

---

## Phase 1 — Foundation (2026-07-16)

Stack picked before being asked: Next.js (App Router) + React + TypeScript +
Tailwind 4, Supabase for Postgres/Auth/RLS/Storage, TMDB for the catalogue,
AniList for anime, Vercel to host. Free tier first, on all of them — the
explicit ask was "run it for free till I get paid users."

The design handoff was reviewed the same day. The real decision buried in
that review: a monochrome grey/black/white glassmorphic direction was chosen
**over** an originally-proposed saffron-orange Indian-coded accent. That's a
positioning call, not a taste call — premium/editorial (Letterboxd/Linear
energy), not "another Indian app with the flag colours." It's why color stays
restricted to poster art, tier bands and profile banners everywhere in the
app, and why the landing page (built much later, Phase 4) needed an explicit,
separate justification before color was allowed there at all.

Schema went in the same day (`supabase/migrations/20260716120001_initial_schema.sql`
onward). Two decisions from this phase that later paid for themselves
directly:

- **`media_external_ids` as an indirection layer**, rather than using TMDB
  ids as primary keys anywhere. The stated reason at the time was anime
  reconciliation (AniList ids and TMDB ids need to map to the same internal
  title) — but this same indirection is what made the Discover/Search image
  audit in Phase 7 tractable: every poster in the app traces back through one
  typed path (`posterUrl`/`backdropUrl` in `lib/tmdb/client.ts`), so auditing
  "every place a TMDB image gets rendered" was a grep, not an archaeology dig.
- **`show_progress` kept deliberately separate from `watched_entries`**, with
  an explicit schema comment: don't derive the resume point from
  `MAX(watched_at)`, because users jump around and need explicit control.
  This exact invariant is what made the Phase 5 resume-pointer bug fixable
  with confidence instead of a guess — the correct fix was implied by a
  decision made on day one, months before the bug existed.

---

## Phase 2 — The free-tier gets real (2026-07-30 – 07-31)

The first genuinely humbling numbers. A measured baseline on 2026-07-30,
against real (if modest) usage data, found:

- **Continue Watching for 5 shows: 5 Supabase queries, 171 episode rows, 32 KB
  — to extract 5 episodes.** 34× more data read than needed, from fetching
  every episode of every in-progress show and finding the next unwatched one
  in JavaScript instead of in the database.
- **The title page fired `auth.getUser()` six separate times per render** —
  and each call is a network round-trip to Supabase Auth to validate the JWT,
  not a local decode. Every query helper had grown its own independent
  Supabase client and its own auth check.
- **PostgREST silently truncates any read at 1000 rows.** No error, no
  signal — you just get 1000 rows back and nothing tells you there were
  more. This had already produced a real wrong-numbers bug: a user with 1490
  watched entries had their stats computed from an arbitrary 1000 of them.

**The lesson underneath all three, not just the fixes:** none of these were
exotic bugs. They were the default, naive way to write each piece of code,
and every one of them looks completely fine in isolation — a query per
helper, a JOIN done in JS instead of SQL, a `.select()` with no thought given
to row count. They only become bugs at a scale that a solo dev testing alone
doesn't naturally produce. The fix for all three ended up being the same
pattern: push the work into Postgres (an RPC with a row-constructor
comparison for Continue Watching, one `cache()`-wrapped auth check reused
across a render, `fetchAllRows` pagination wherever a table could plausibly
exceed a few hundred rows) rather than fetching broadly and computing in
JavaScript. That pattern is now the default instinct, not a special case.

---

## Phase 3 — The Discover engine (2026-08-01)

Building the browse surface (genre, rating, language, streaming provider,
year/decade axes) surfaced a class of bug that's worse than a crash, because
it's silent: **TMDB ignores unknown query parameters and returns 200.** A
request with a typo'd filter — `with_bogus_thing=x` — came back with the full
1,164,683-result unfiltered catalogue, not an error. A few concrete ways this
bites:

- `primary_release_year` is silently accepted and ignored on `/discover/tv`
  (228,129 results — the unfiltered total — instead of the correct 15,031).
  The date field is `primary_release_date` for movies, `first_air_date` for
  TV, and nothing tells you if you used the wrong one.
- Movie and TV genre id sets don't overlap cleanly — reusing a movie genre id
  on a TV row returns an empty grid, not an error.
- A flat vote-count floor for "top rated" doesn't work in either direction:
  too low, and 1-vote 10/10 titles bury The Shawshank Redemption; too low
  *for a specific language*, entire regional-language rows go empty. The
  floor had to be measured per population, not guessed once.

**The fix was architectural, not defensive:** one typed `DiscoverParams`
surface (`lib/tmdb/client.ts`) that every browse row goes through, so a typo
becomes a TypeScript error instead of a silently-wrong production row. The
lesson generalizes past TMDB: **a third-party API returning success on bad
input is more dangerous than one that errors**, because nothing forces you to
handle the failure — the only real defense is not letting a hand-built
request reach the API at all.

---

## Phase 4 — The landing page (2026-08-02 – 08-04)

The most iteration of any single surface, and the richest set of "that looked
right until I actually measured it" moments:

- **`overflow: hidden` on a section silently froze every scroll-driven CSS
  animation inside it.** The property makes the element a scroll container,
  so `animation-timeline: view()` resolved against that non-scrolling box
  instead of the document — the animations existed, had real timelines
  attached, and simply never moved. Found by measuring `stroke-dashoffset`
  across a deliberate scroll sweep instead of trusting a screenshot.
- **`animation-range: entry …` is proportional to the element's own height** —
  useless on a 12px underline SVG, which drew its whole stroke over 12px of
  scroll (i.e., snapped, not drew). `cover` ranges fixed it, but only after
  measuring the actual scroll-distance-to-completion and seeing ~12px instead
  of the intended ~200px.
- **A final section can never be scrolled fully into view**, so its own
  `cover` progress tops out partway (measured at 54% for one section) — any
  animation range ending above that reachable ceiling freezes mid-draw
  forever. This one took two attempts: anchoring to a section-level named
  timeline fixed *when* the animation started but broke completion entirely,
  because the section's own reachable ceiling was even lower than the
  element's.
- **`background-clip: text` clips to the element's own box**, and a display
  line-height under 1 (used for tight, poster-scale headline tracking) means
  the last line's descender — literally the "g" in "again" — hangs outside
  that box and renders as nothing, silently, because the fill color is
  transparent. Fixed with padding sized to the actual measured descender ink,
  not a guess.
- **An unlayered CSS class always beats a Tailwind utility on the same
  property**, regardless of specificity, because Tailwind's utilities live in
  a cascade layer and an unlayered rule always wins over anything layered.
  `.glass` + `hover:bg-secondary` compiled cleanly and did precisely nothing
  — caught once, then caught again in a near-identical spot on the profile
  page days later, which is the real reason it's now written down instead of
  just fixed twice.
- **Supabase's `signUp()` never reports "this email is taken"** — a
  deliberate anti-enumeration protection, not a bug — but it returns the
  existing user with an *empty* `identities` array, silently, and sends no
  email. The app didn't check for that signal, so a second signup attempt
  claimed "check your inbox" for an email that got nothing. Fixed by checking
  for the empty-identities signal and, when it fires, attempting a silent
  sign-in with the same credentials instead of just erroring.

**The generalizable lesson:** almost every one of these bugs *looked correct
in a screenshot*. Scroll-driven CSS, clipped gradients, and cascade-layer
precedence are all cases where the browser renders *something* plausible even
when the underlying mechanism is completely broken — the animation exists,
the button looks styled, the text is visible. The only reliable check turned
out to be measuring the actual runtime value (computed styles, scroll
position over time, real HTTP response headers) rather than trusting that a
visual result implies the mechanism producing it is correct.

---

## Phase 5 — The bug that needed a live, disposable test (2026-08-04)

The Continue Watching resume pointer had a real, reported bug: mark episode 1
watched, unmark it, and the card still offered "Mark E2 watched" — as if
episode 1 were still done. Root cause: `unmarkEpisodeAction` deleted the
watched row but never touched the stored resume pointer, so it went stale.

The fix itself was small. What's worth remembering is how it got *verified*:
static code reading wasn't enough to be confident, so the fix was checked
against a fully isolated, disposable test — a throwaway auth user, throwaway
show, throwaway episodes, created via the service-role key, run through the
exact real code path, checked against the real `get_continue_watching` RPC,
then deleted. Confirmed cleanup with a follow-up query before moving on.

That test caught something static reading alone would have missed: the fix
was correct **going forward**, but a `show_progress` row already corrupted by
an unmark taken *before* the fix existed doesn't self-heal — nothing
retroactively touches a row nobody interacts with again. That gap became its
own migration (`20260804120002_backfill_resume_pointer.sql`), written but
deliberately not self-applied — schema and data-repair changes on the live
project stay something the owner runs, not something an assistant runs
silently.

**The lesson:** for anything involving real backend state, reading the code
and reasoning about it is necessary but not sufficient — the only way to be
actually confident is to run the real code path against real (if disposable)
data and look at the real output. And a forward-fix is not automatically a
backward-fix; "corrected" and "corrected retroactively" are different claims
that both need saying out loud.

---

## Phase 6 — Auth, for real (2026-08-04 – 08-11)

Rebuilding signup/login/forgot-password surfaced the second Supabase
anti-enumeration behavior (see Phase 4 for the first) and a genuinely
consequential infra bug: **a password-reset email sent a real user to
`localhost:3000` instead of the production domain**, because the redirect
URL was built from `NEXT_PUBLIC_APP_URL` — a static string, hardcoded to
`http://localhost:3000` in `.env`, which is only ever correct for one
environment at a time. Whatever value ends up set on Vercel is what *every*
deploy gets, including every preview deployment, each of which gets its own
unique throwaway URL a static variable could never point at correctly.

Fixed by deriving the origin from the actual incoming request's
`x-forwarded-host`/`x-forwarded-proto` headers instead — correct on Vercel
for production and every preview URL automatically, with nothing to keep in
sync by hand. Verified by logging the resolved value against a real local
request before trusting it, rather than assuming the header names were right.

A second, separate cause was found for the same symptom and left
**deliberately unfixed from code**: the email correctly pointed at the right
domain but still landed on `/?code=...` — the raw code, never exchanged —
which is what happens when Supabase's dashboard-side Redirect URL allow-list
rejects a `redirectTo` it doesn't recognize and silently falls back to the
project's bare Site URL instead. No amount of application code fixes a
dashboard setting; that one stayed the owner's to fix, with the exact URL
patterns to add written down instead of guessed at.

**The lesson:** a bug that "looks the same" from the user's side can have two
independent causes, and only one of them might be yours to fix. Splitting
"here's what I fixed and verified" from "here's what still needs your own
dashboard/account access" mattered more than getting to one tidy root cause.

---

## Phase 7 — The first scaling wake-up call (2026-08-11)

The first infrastructure alert that came from a monitoring email instead of
from reading a doc: Vercel notified that the free Hobby tier's Image
Optimization quota (5,000 transformations/month) was at 75%. From a project
with exactly one user — its own builder.

The investigation (not a guess): Vercel counts one transformation per unique
`(source image, width bucket, format)` `next/image` ever requests, cached
after that. The `media` table — which only grows when a title is actually
touched, per the lazy-cache rule in `AGENTS.md` — had grown from 63 rows on
2026-07-30 to **444 by 2026-08-11**, and Discover/Search grids render TMDB
posters for plenty of titles that never even reach that table. The spend was
real, personal dogfooding across a genuinely large slice of TMDB's catalogue
— not a bug in one place, but the natural cost of an app whose whole feature
set is "browse a huge catalogue."

Two real, zero-downside wastes were still found and fixed in
`next.config.ts`, though: `deviceSizes` included 2048px/3840px buckets when
no source image in the app is ever wider than TMDB's 1280px backdrop bucket
(a pure, counted, upscale-for-nothing), and `minimumCacheTTL` defaulted to 4
hours for images whose source URLs never change — bumped to a year, since
TMDB's own CDN, checked directly, already sends `Cache-Control: max-age`
matching almost exactly that same one-year window. (Checking that directly,
rather than assuming, also caught that a first-pass guess at Next's *default*
`minimumCacheTTL` — 60 seconds — was wrong; the real default, confirmed from
Next's own source, is 4 hours. Wrong assumptions about defaults are exactly
the kind of thing worth verifying before repeating them to anyone.)

The harder, more valuable decision was what **not** to do yet: skip Vercel's
optimizer entirely for poster images (`unoptimized`), serving TMDB's own
CDN URLs directly. Measured rather than assumed: TMDB's raw JPEG runs about
28% larger than Vercel's WebP-converted equivalent for the same image
(36,552 bytes vs 26,137, checked directly), and applying `unoptimized`
globally would also hit the one image in the app where that actually matters
— the title page's full-bleed, `priority`-loaded backdrop, which is exactly
the LCP-critical, "test it on a cheap Android" image `AGENTS.md` already
calls out. The call: **not yet.** The quota resets on the billing cycle, the
config fixes above are retroactive (every image already viewed is now cached
for a year), and reaching for a real product tradeoff to fix a number that's
about to reset anyway would be optimizing on vibes — the exact thing
`OPTIMIZATIONS.md`'s own governing rule warns against. If `unoptimized` is
ever needed, the investigation already found it's a *small*, well-scoped
change — one shared component (`PosterCard.tsx`) captures nearly all
poster-grid volume across Discover/Library/Search, since that's the single
primitive almost everything funnels through. That's worth knowing now; doing
it isn't, yet.

**The lesson, stated plainly because it's the first time it happened for
real:** a scary-looking usage alert is a prompt to *measure*, not to
panic-cut a feature. The instinctive fear — "I'm about to get throttled or
billed" — turned out, on actually pulling the numbers, to be "I tested my own
app thoroughly, most of that cost won't recur, and the two genuinely free
config wins are already live." That gap between the scary feeling and the
measured reality is exactly the muscle worth building before a real user's
traffic is the thing generating the alert instead.

---

## Phase 8 — Discover Phase 2: when the plan itself was wrong (2026-08-11)

`DESIGN_ROADMAP.md` had, for over a week, a confident-sounding blockquote:
*"The editorial three (franchises, must-watches, mood) need a content model —
and we already have one. `custom_lists` + `custom_list_items`... powers all
three rows with zero new schema."* Reasonable-sounding, specific, and wrong
for one of the three. The very same document's own Mood paragraph, written
right above that blockquote, already said the real mechanism: mood is a
genre+keyword combo that "rides the Phase 1 fetcher" — a live TMDB query, not
a stored list at all. The blockquote had bundled three things that weren't
actually the same shape, and nothing caught it until building against it
required picking one mechanism and committing.

That's worth sitting with: this wasn't a bug, or code that lied — it was a
**planning document that quietly contradicted itself two paragraphs apart**,
and reading it once, even carefully, wasn't enough to catch it. What caught it
was implementation forcing a concrete decision ("does Mood get an editorial
account or not?") that a reasoning pass over prose never forced.

Two more measure-don't-assume moments in the same session, smaller but the
same shape:

- TMDB has no "all franchises" endpoint, confirmed correctly a week earlier —
  but the *specific* collection ids used to seed it (Avengers, Harry Potter,
  Bāhubali, etc.) were looked up live via `/search/collection` and
  cross-checked against `/collection/{id}` for real, released, poster-having
  parts before being hardcoded, not typed from memory. Two of five franchises
  actually needed that filter — the Avengers collection includes two
  not-yet-released sequels, and Bāhubali includes an unreleased spin-off —
  which would have shown a "watch now" row containing a movie nobody can
  watch.
- The mood → keyword mapping needed the exact same discipline as
  `LANGUAGE_RATING_FLOOR` months earlier: a first guess at "edge of your
  seat" (thriller + suspense keyword, popularity-sorted, floor 20) surfaced a
  32-vote title above genuinely known thrillers. Not wrong syntax — just a
  floor that hadn't been checked against real output yet, exactly the same
  failure shape as the rating-floor lesson from Phase 3, in a new context.

Confirming the whole pipeline meant going further than reading code, too: a
throwaway confirmed test account, signed in through the real login form, used
to view the real rendered Discover page — because the query working in
isolation (checked separately via the anon client, matching exactly what an
unauthenticated read does) doesn't prove the *page* renders it correctly.
Along the way, the browser tooling itself produced a red herring worth
naming: a stale `ReferenceError` sat in the tab's console for the rest of the
session, replaying identically across full page reloads *and* full dev-server
restarts, long after the actual bug (a mid-edit intermediate state) was gone.
The only thing that settled it was going around the browser entirely — a raw
authenticated HTTP request straight to the server, checked for the error
string in the literal response body. Zero occurrences. The page was correct;
the console tab's own history wasn't trustworthy evidence anymore.

**The lesson:** a planning doc, like code, can be locally correct in every
paragraph and still be globally wrong once two paragraphs are read together —
and the only reliable way to catch that is to build the thing and let a real
decision point surface the contradiction, not to re-read the prose more
carefully. The corollary for verification generally: when a tool's own output
becomes suspect (the same error, unchanged, surviving actions that should
have cleared it), stop trusting that tool's report and go get the answer from
somewhere that can't be stale — here, the raw server response.

---

## Running list — lessons that generalize past this app

Pulled out of the phases above because they're worth remembering
independent of BingeTrackr specifically:

1. **The naive version of a query looks fine until scale reveals it.**
   Fetch-everything-and-compute-in-JS isn't a beginner mistake, it's the
   default shape of a first pass — the fix is a habit of pushing computation
   into the database, not a one-time audit.
2. **A third-party API returning HTTP 200 on bad input is more dangerous
   than one that errors**, because nothing forces the failure to be handled.
   One typed surface beats scattered hand-built requests every time.
3. **A visually-correct result doesn't imply the mechanism behind it is
   correct.** Scroll animations, clipped gradients, and CSS cascade order are
   all places the browser renders something plausible over a completely
   broken mechanism. Measure the actual runtime value; don't trust the
   screenshot.
4. **A forward-fix is not a backward-fix.** Correcting how a bug happens
   going forward doesn't repair state the bug already corrupted — that's a
   second, explicit piece of work, not a side effect of the first.
5. **Static config (a base URL, a feature flag) that's correct for exactly
   one environment will eventually run in the wrong one.** Deriving values
   from the actual request/environment beats hardcoding + hoping to
   remember to change it per deploy.
6. **The same symptom can have two independent causes** — one in your code,
   one in a dashboard/account setting you don't control. Fix what's yours,
   name what isn't, and don't force a single tidy root cause that isn't real.
7. **A scary usage number is a prompt to measure, not to cut a feature.**
   Free-tier alerts very often reflect your own testing, not real load —
   and a quota that resets on a billing cycle is rarely worth a permanent
   product tradeoff before you've seen one real cycle under the fix.
8. **Centralizing a shared primitive early (one `PosterCard`, one
   `discoverTitles` fetcher, one auth check) is what makes the *next*
   optimization cheap.** The cost of that architecture decision is paid
   once, early, when it's easy; the payoff shows up months later, exactly
   when a real constraint shows up and a two-line fix in one file is worth
   more than a scattered one across nine.
9. **A planning document can be locally correct in every paragraph and still
   contradict itself two paragraphs apart.** Reading it again, even
   carefully, doesn't reliably catch that — only building against it, at the
   point where a real decision has to be made one way, surfaces which
   paragraph was actually right.
10. **When a tool's own report becomes suspect, stop trusting that tool and
    verify from somewhere that can't be stale.** The same error surviving a
    full page reload AND a full process restart is itself the signal —
    real, live bugs vary or clear; only cached/stale ones replay identically
    forever.
