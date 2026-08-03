import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/trackr/BrandMark";
import { Scribble, Underlined } from "@/components/trackr/Scribble";
import { ScrollToLink } from "@/components/trackr/ScrollToLink";
import { ThemeToggle } from "@/components/trackr/ThemeToggle";
import { INDIAN_LANGUAGES } from "@/lib/discover/axes";
import { discoverTitles, getTv, posterUrl } from "@/lib/tmdb/client";

/**
 * The logged-out landing page at `/`.
 *
 * The copy is the project owner's own script, kept in their voice on purpose —
 * first person, funny where it wants to be, honest about what isn't built. It is
 * not marketing boilerplate and should not be "professionalised" into any.
 *
 * Structural notes:
 *
 * **Static, zero fetches.** No TMDB call, no Supabase read, no `cookies()`. `/`
 * stays the one prerendered route in the build, which matters because it's what
 * gets shared, crawled and cold-opened. Poster art is the handoff's gradient
 * tile — its specified fallback state — so the showcase costs no requests and
 * cannot break when TMDB or an API key is unavailable.
 *
 * **Colour is allowed here.** The monochrome-chrome rule in `AGENTS.md` governs
 * the *app*; this is a marketing surface. Every hue comes from `--grad-*` /
 * `--tint-*`, whose stops are lifted from palettes the handoff already sanctions
 * (tier-S gold, tier-A ember, Rosé banner). Don't carry these into the app shell.
 *
 * **Almost zero JS.** `ThemeToggle` and `ScrollToLink` (the two `#why`/`#free`
 * jump links — see that file for why a plain hash anchor isn't enough) are the
 * only client components; the scroll choreography itself is CSS scroll-driven
 * animation plus `position: sticky`.
 *
 * **Unbuilt features are labelled unbuilt.** Items 7 and 8 carry a "Not yet"
 * badge — public lists/tiers and recommend-to-friends are both on the v1 OUT
 * list. Drop the badge when the feature lands, not before.
 */
export default function LandingPage() {
  return (
    <>
      <div className="scroll-progress" aria-hidden />

      <FloatingControls />

      <main className="flex-1 flex flex-col">
        <Hero />
        <StorySection />
        <TitleShowcase />
        <FeatureList />
        <FreeSection />
      </main>

      <SiteFooter />
    </>
  );
}

/* ─── Fixed controls ─────────────────────────────────────────────────────
   No navbar by design. The only persistent chrome is the theme switch and the
   login pill. `env(safe-area-inset-top)` keeps them clear of the notch when the
   page is opened from an iOS home-screen shortcut. */

function FloatingControls() {
  return (
    <div
      className="fixed right-4 sm:right-6 z-50 flex items-center gap-2"
      /* Shares `--float-top` with the hero's `.hero-aligned-top`, which derives
         its padding from it so the brand lockup sits level with this row. */
      style={{ top: "var(--float-top)" }}
    >
      <ThemeToggle />
      <Link
        href="/login"
        className="glass-liquid inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-sm font-semibold transition-transform active:translate-y-px"
      >
        {/* z-1 keeps the label above `.glass-liquid`'s sheen pseudo-element. */}
        <span className="relative z-1 inline-flex items-center gap-1.5">
          Log in
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>
    </div>
  );
}

/** The primary call to action, in the accent gradient. */
function GradientCta({
  href,
  children,
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Link
      href={href}
      className={`grad-surface grad-btn inline-flex items-center justify-center gap-2 rounded-2xl font-display font-bold active:translate-y-px ${
        size === "lg" ? "h-14 px-9 text-lg" : "h-13 px-7 text-base"
      }`}
    >
      {children}
      <ArrowRight className={size === "lg" ? "w-5 h-5" : "w-4 h-4"} />
    </Link>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative isolate grain">
      <div className="aurora aurora-warm" aria-hidden />

      {/* `hero-aligned-top` replaces the old `pt-20 sm:pt-28 lg:pt-32`: the top
          padding is now derived from `--float-top` so the lockup lines up with the
          fixed controls on first load, which also tightens the page's top spacing. */}
      <div className="hero-aligned-top relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8 pb-16 sm:pb-24 lg:pb-28">
        <BrandLockup size={30} className="mb-12 sm:mb-16" />

        <div className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-10">
          <div className="flex-1 min-w-0 flex flex-col gap-6 lg:max-w-xl">
            <p className="text-meta text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase">
              Movies · TV · Anime · Made for India
            </p>

            <h1 className="display-hero text-sheen">
              Never lose your place again.
            </h1>

            <p className="text-body text-base sm:text-lg leading-relaxed max-w-lg">
              BingeTrackr remembers the exact episode you&apos;re on — across
              every show, every season, every borrowed login. Mark one episode
              watched and it tells you what&apos;s next and where to stream it in
              India.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
              <GradientCta href="/signup">Create account</GradientCta>
              <ScrollToLink
                targetId="why"
                className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl border border-border font-semibold text-sm hover:bg-secondary transition-colors"
              >
                Why this app
              </ScrollToLink>
            </div>

            {/* The asterisk is a real footnote, not decoration — it jumps to the
                section that explains the funding, which is where a sceptical
                reader is already headed. */}
            <p className="text-meta text-xs">
              Free. No card, no ads.
              <ScrollToLink
                targetId="free"
                className="ml-0.5 hover:text-foreground transition-colors"
                ariaLabel="Read why this is free"
              >
                *
              </ScrollToLink>
            </p>
          </div>

          {/* Parallax on the wrapper, float on the inner element — two
              animations writing `transform` on one element would fight. */}
          <div className="parallax-slow lg:flex-1 lg:max-w-md w-full">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The hero mockup: a Continue Watching card with the confirmation toast under it.
 *
 * Mirrors the real `ContinueWatchingCard` closely — including the segmented
 * progress bar and episode count, which the first version of this page omitted
 * and which is the single most informative thing on the card. It also shows a
 * where-to-watch chip, so the mockup demonstrates two features rather than one.
 */
/**
 * TMDB id for Demon Slayer, resolved against the live API rather than guessed
 * (`/search/tv?query=Demon Slayer` → 85937, "Demon Slayer: Kimetsu no Yaiba",
 * 7,385 votes — unambiguous). Fetched by id via `getTv` so the poster survives
 * TMDB replacing the artwork; a hardcoded `poster_path` would eventually 404.
 */
const MOCKUP_TMDB_TV_ID = 85937;

/**
 * The episode numbers below are TMDB's, checked against `/tv/85937`:
 * 63 episodes total, and "Swordsmith Village Arc" is **season 4** (11 eps), not
 * season 2. The earlier copy said "S2 · E5 … 17/26" — wrong arc, and 26 is
 * season 1's count rather than the series total. This audience is anime
 * watchers; they would notice.
 *
 * Watched = S1 26 + S2 7 + S3 11 + 5 of S4 = 49 of 63.
 */
const MOCKUP = {
  season: 4,
  episode: 5,
  nextEpisode: 6,
  nextTitle: "Aren't You Going to Become a Hashira?",
  watched: 49,
  total: 63,
} as const;

async function PhoneMockup() {
  const { watched, total } = MOCKUP;
  const pct = Math.round((watched / total) * 100);

  // A missing key or a TMDB blip must not break the hero — fall back to the
  // gradient tile, which is the handoff's specified placeholder anyway.
  let poster: string | null = null;
  try {
    const show = await getTv(MOCKUP_TMDB_TV_ID);
    poster = posterUrl(show.poster_path, "w342");
  } catch (err) {
    console.warn("[landing] mockup poster unavailable:", err);
  }

  return (
    <div
      aria-hidden
      className="relative overflow-hidden border border-border mx-auto w-full max-w-sm"
      style={{
        borderRadius: 26,
        background: "linear-gradient(160deg, var(--bg2), var(--bg))",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 70% 6%, var(--tint-1), transparent 62%)",
        }}
      />

      <div className="relative px-5 py-9 sm:px-7 sm:py-12">
        <div className="float-slow flex flex-col gap-2.5">
          <div
            className="glass flex gap-3.5 p-3.5"
            style={{ borderRadius: 18, boxShadow: "var(--shadow)" }}
          >
            {/* Real poster art. The gradient tile underneath shows through only
                while the image decodes, or if the fetch above failed.

                No play affordance on purpose — the app doesn't play video, it
                tracks what you've watched elsewhere. Advertising a play button
                would promise a feature we don't have. */}
            <div
              className="relative shrink-0 overflow-hidden"
              style={{
                width: 68,
                height: 102,
                borderRadius: 10,
                background: "linear-gradient(150deg,#5a1d10,#ff6b35)",
              }}
            >
              {poster && (
                <Image
                  src={poster}
                  alt=""
                  fill
                  sizes="68px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="px-1.5 py-0.5 rounded-md font-display font-bold text-[9px]"
                  style={{ background: "var(--surface2)" }}
                >
                  S{MOCKUP.season} · E{MOCKUP.episode}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded-md font-display font-bold text-[9px]"
                  style={{
                    background: "var(--surface2)",
                    color: "var(--status-watching)",
                  }}
                >
                  Watching
                </span>
              </div>

              <p className="font-display font-bold text-sm leading-tight">
                Demon Slayer
              </p>
              <p className="text-meta text-[10px] leading-snug mt-0.5 line-clamp-1">
                Next: E{MOCKUP.nextEpisode} — {MOCKUP.nextTitle}
              </p>

              {/* Progress — the most useful line on the card. */}
              <div className="flex items-center gap-2 mt-2.5">
                <span
                  className="h-1 flex-1 rounded-full overflow-hidden"
                  style={{ background: "var(--border)" }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background:
                        "linear-gradient(90deg, var(--grad-1), var(--grad-2))",
                    }}
                  />
                </span>
                <span className="text-meta text-[9px] tabular-nums shrink-0">
                  {watched}/{total}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="grad-surface inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-display font-bold text-[10px]">
                  <Check className="w-3 h-3" strokeWidth={2.8} />
                  Mark E{MOCKUP.nextEpisode}
                </span>
                {/* Where-to-watch chip. Netflix is not decorative: verified
                    against `/tv/85937/watch/providers` that it's a flatrate
                    provider for this show in region IN (id 8, display_priority 0
                    — the top-ranked provider for India, which is also why the
                    Discover engine's provider rail leads with it). */}
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-1.5 rounded-lg text-[9px] font-semibold"
                  style={{ background: "var(--surface2)" }}
                >
                  <span
                    className="grid place-items-center w-3.5 h-3.5 rounded font-display font-extrabold text-[7px] text-white"
                    style={{ background: "#e50914" }}
                  >
                    N
                  </span>
                  Netflix
                </span>
              </div>
            </div>
          </div>

          <div
            className="glass flex items-center gap-2.5 px-3.5 py-3"
            style={{ borderRadius: 14, boxShadow: "var(--shadow)" }}
          >
            <span className="grad-surface grid place-items-center w-6.5 h-6.5 rounded-full animate-pop">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-[11px]">
                Episode {MOCKUP.episode} marked watched
              </p>
              <p className="text-meta text-[9px]">
                {MOCKUP.watched}/{MOCKUP.total} · 19 h 36 m logged
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── The story ───────────────────────────────────────────────────────── */

const BEATS = [
  {
    text: (
      <>
        Ever gone back to a show you loved, hit play on what you were{" "}
        <em className="not-italic font-hand-inline">fairly</em> sure was the
        right episode — and rewatched ten, fifteen of them before anything
        finally felt unfamiliar again?
      </>
    ),
    note: "Same here.",
  },
  {
    text: (
      <>
        When I was a kid I downloaded everything. Films in folders, renamed by
        hand, a library I actually{" "}
        <Underlined variant="underline">maintained</Underlined>.
      </>
    ),
    note: "I knew where every single one was.",
  },
  {
    text: (
      <>
        Then OTT happened. Wonderful. Seamless. Everything, instantly, no hard
        drive required.
      </>
    ),
    note: "This lasted about a month.",
  },
  {
    text: (
      <>
        Because nobody can afford every subscription. So you borrow a login, use
        a friend&apos;s account, finish a season on someone else&apos;s profile —
        and your history scatters across five apps that each think you&apos;re a
        different person.
      </>
    ),
    note: "Lost track. Again.",
  },
  {
    text: <>…and then a lot of other shit happened.</>,
    note: null,
  },
  {
    text: (
      <>
        So I planned this app for years. Every tracker I tried got it{" "}
        {/* Explicit {" "} after the element, not a literal source space: that
            space was being stripped at compile time and rendering as
            "almostright". Use this form after every <Underlined>. */}
        <Underlined variant="double">almost</Underlined>{" "}
        right, then did one thing in a way I couldn&apos;t live with. Eventually
        I gave up waiting and built the one I actually wanted.
      </>
    ),
    note: "You're looking at it.",
  },
] as const;

function StorySection() {
  return (
    <section
      id="why"
      className="relative scroll-mt-8 border-t border-border"
      style={{ background: "var(--bg2)" }}
    >
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-20 sm:py-28">
        <div className="flex flex-col gap-4 mb-14 sm:mb-20">
          <p className="text-meta text-[11px] font-semibold tracking-[0.18em] uppercase">
            Why this app
          </p>
          <h2 className="display-section text-sheen">
            I kept rewatching the same twelve episodes.
          </h2>
        </div>

        {/* Faint full-length track plus a brighter line growing down it. Both sit
            at the horizontal centre of the 11px nodes. */}
        <div className="relative">
          <div
            aria-hidden
            className="story-track absolute top-0 bottom-0 w-px left-[5px] sm:left-[7px]"
          />
          <div
            aria-hidden
            className="story-line absolute top-0 bottom-0 w-px left-[5px] sm:left-[7px]"
          />

          <ol className="flex flex-col gap-11 sm:gap-14">
            {BEATS.map((beat, i) => (
              <li
                key={i}
                className={`reveal relative pl-8 sm:pl-12 ${
                  i % 3 === 1 ? "reveal-2" : i % 3 === 2 ? "reveal-3" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-2 w-[11px] h-[11px] rounded-full border"
                  style={{
                    borderColor: "var(--border)",
                    background:
                      i === BEATS.length - 1
                        ? "linear-gradient(135deg, var(--grad-1), var(--grad-3))"
                        : "var(--bg2)",
                  }}
                />

                <p className="text-base sm:text-lg leading-relaxed text-body">
                  {beat.text}
                </p>

                {beat.note && (
                  <p
                    className={`hand-note mt-3 text-2xl sm:text-3xl text-foreground ${
                      i % 2 === 1 ? "hand-note-right" : ""
                    }`}
                  >
                    {beat.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─── Title showcase ─────────────────────────────────────────────────────
   Two marquee rows drifting opposite ways, showing the breadth of catalogue —
   Hindi, regional Indian, Hollywood, K-drama and anime side by side, which is
   the actual positioning. Gradient tiles rather than real posters keeps the page
   static and request-free; see the file header. */

type Tile = { id: number; title: string; kind: string; posterPath: string };

/** Tiles per row before duplication. See `MarqueeRow` for why 12. */
const TILES_PER_ROW = 12;

/**
 * Real poster art, via the sanctioned `discoverTitles` fetcher.
 *
 * Four queries rather than one, because the point of this section is *breadth* —
 * a single popular feed is all Hollywood and proves nothing about regional
 * coverage. `discoverTitles` already drops results with `poster_path: null`, so
 * a tile can never render as a blank rectangle.
 *
 * These run at build (and on revalidate), not per visitor: nothing here reads
 * cookies or headers, so `/` stays prerendered. The 6h `revalidate` inside
 * `discoverTitles` means the real-world cost is a handful of calls a day.
 */
async function loadShowcase(): Promise<{ rowA: Tile[]; rowB: Tile[] } | null> {
  const toTiles = (
    results: { id: number; title?: string; name?: string; poster_path: string | null }[],
    kind: string,
  ): Tile[] =>
    results
      .filter((r) => r.poster_path)
      .map((r) => ({
        id: r.id,
        title: r.title ?? r.name ?? "Untitled",
        kind,
        posterPath: r.poster_path as string,
      }));

  /** Alternate two lists so each row mixes categories instead of blocking them. */
  const interleave = (a: Tile[], b: Tile[]): Tile[] => {
    const out: Tile[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      for (const t of [a[i], b[i]]) {
        // Dedupe across lists: a popular Hindi film legitimately appears in both
        // the global and the Indian-language query, and the same poster twice in
        // one row looks like a rendering bug.
        if (t && !seen.has(`${t.kind}-${t.id}`) && !seen.has(String(t.id))) {
          seen.add(String(t.id));
          out.push(t);
        }
      }
    }
    return out;
  };

  try {
    const [films, indian, series, anime] = await Promise.all([
      discoverTitles("movie", { sort: "popular", minVotes: 800 }),
      discoverTitles("movie", {
        sort: "popular",
        originalLanguages: INDIAN_LANGUAGES.map((l) => l.code),
        minVotes: 80,
      }),
      discoverTitles("tv", { sort: "popular", minVotes: 300 }),
      // Animation + Japanese is the anime proxy; genre 16 is Animation on TV too.
      discoverTitles("tv", {
        sort: "popular",
        genres: [16],
        originalLanguages: ["ja"],
        minVotes: 150,
      }),
    ]);

    const rowA = interleave(
      toTiles(films, "Film"),
      toTiles(indian, "Indian cinema"),
    ).slice(0, TILES_PER_ROW);
    const rowB = interleave(
      toTiles(series, "Series"),
      toTiles(anime, "Anime"),
    ).slice(0, TILES_PER_ROW);

    // A half-empty marquee looks broken; better to drop the section than ship a
    // row of four tiles looping every two seconds.
    if (rowA.length < 6 || rowB.length < 6) return null;
    return { rowA, rowB };
  } catch (err) {
    // A missing TMDB_API_KEY or a TMDB outage must not fail the build of the one
    // page that has to be up. The section is omitted instead.
    console.warn("[landing] poster showcase unavailable:", err);
    return null;
  }
}

function PosterTile({ tile }: { tile: Tile }) {
  const src = posterUrl(tile.posterPath, "w342");

  return (
    <div className="shrink-0 w-[104px] sm:w-[124px] mr-3 flex flex-col gap-2">
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "2 / 3",
          borderRadius: 12,
          // Shows through only while the image decodes.
          background: "var(--bg2)",
          boxShadow: "var(--poster-shadow)",
        }}
      >
        {src && (
          <Image
            src={src}
            alt=""
            fill
            // Tiles are ~104-124px wide, so the optimizer emits a small variant
            // rather than shipping the full w342 source to the client.
            sizes="(min-width: 640px) 124px, 104px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display font-bold text-[11px] sm:text-xs truncate leading-tight">
          {tile.title}
        </p>
        <p className="text-meta text-[10px] truncate">{tile.kind}</p>
      </div>
    </div>
  );
}

/**
 * One marquee row. The tile list is rendered TWICE and the track translates
 * exactly -50%, so the second copy occupies the first's start position when the
 * loop restarts — seamless with no JS.
 *
 * 12 tiles per copy is a minimum, not a preference: at ~136px per tile a copy is
 * ~1630px, and the loop only looks continuous while one copy is at least as wide
 * as the viewport. Fewer tiles would visibly snap on a wide monitor.
 */
function MarqueeRow({ tiles, reverse }: { tiles: Tile[]; reverse?: boolean }) {
  return (
    <div className="marquee-row" aria-hidden>
      <div className={`marquee-track ${reverse ? "marquee-track-rev" : ""}`}>
        {[...tiles, ...tiles].map((tile, i) => (
          <PosterTile key={`${tile.id}-${i}`} tile={tile} />
        ))}
      </div>
    </div>
  );
}

const KINDS = ["Movies", "Series", "Anime", "K-drama", "Regional Indian"];

/** Async server component — it owns its own fetch, per the convention in AGENTS.md. */
async function TitleShowcase() {
  const showcase = await loadShowcase();

  return (
    <section className="relative isolate grain border-t border-border">
      <div className="aurora aurora-warm" aria-hidden />

      <div className="relative z-10 py-20 sm:py-28 flex flex-col gap-10 sm:gap-14">
        {/* Heading is outside the marquee rows on purpose — `.marquee-row` is
            overflow:hidden, which would freeze a `.reveal` inside it. */}
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 flex flex-col gap-5">
          <h2 className="display-section text-sheen">
            Bollywood to Busan to shonen.
          </h2>
          <p className="text-body text-base leading-relaxed max-w-xl">
            One library for all of it. Regional Indian cinema is a first-class
            citizen here, not an afterthought bolted onto a Hollywood database.
          </p>
          <ul className="flex flex-wrap gap-2 mt-1">
            {KINDS.map((kind) => (
              <li
                key={kind}
                className="glass px-3 py-1.5 rounded-full text-xs font-semibold"
              >
                {kind}
              </li>
            ))}
          </ul>
        </div>

        {showcase && (
          <>
            <div className="flex flex-col gap-4 sm:gap-5">
              <MarqueeRow tiles={showcase.rowA} />
              <MarqueeRow tiles={showcase.rowB} reverse />
            </div>

            {/* Screen readers get the titles once as text, rather than two
                duplicated aria-hidden marquees. */}
            <p className="sr-only">
              Titles including{" "}
              {[...showcase.rowA, ...showcase.rowB]
                .map((t) => t.title)
                .join(", ")}
              .
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ─── What you get ───────────────────────────────────────────────────────
   The eight items from the script. The tier board and the hours figure live
   INSIDE their own cards here — as standalone sections they had no argument for
   being on the page. `soon: true` renders an honest badge rather than dropping
   the item; the owner wants the roadmap visible. */

/**
 * The lifetime-hours figure, as evidence inside the Stats card.
 *
 * Deliberately ONE line: number, then the supporting counts as plain meta text.
 * The earlier version stacked a 5xl figure above two glass tiles, which made this
 * card 294px against a 163px row-mate — in a row-major grid that 80% height
 * difference is what made equal-height rows look like padded empty boxes. Keeping
 * this compact is what lets the grid stay row-major.
 */
function StatsMini() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 mt-1">
      <span className="grad-text font-display font-extrabold text-3xl sm:text-4xl tracking-[-0.035em] tabular-nums leading-none">
        1,284
      </span>
      <span className="text-meta text-[11px] leading-tight">
        hours · 312 shows · 1,674 episodes
      </span>
    </div>
  );
}

const ITEMS = [
  {
    title: "Show tracking",
    body: (
      <>
        The episode you&apos;re on. The one that&apos;s next. That is the entire
        reason this exists.
      </>
    ),
  },
  {
    title: "A library that admits the truth",
    body: (
      <>
        Watching · Watched · Watchlist ·{" "}
        <strong className="font-semibold text-foreground">Dropped</strong>. Yes,
        Dropped. Not everything deserves to be finished.
      </>
    ),
  },
  {
    title: "A Discover page",
    body: (
      <>
        What&apos;s trending, what&apos;s actually worth it, and what to start
        next — filtered by genre, language, rating and where it&apos;s streaming
        in India.
      </>
    ),
  },
  {
    title: "Stats",
    body: (
      <>
        Precisely how much of your life you have handed over to this beautiful
        hobby — plus what you were watching on this day in previous years.
      </>
    ),
    visual: <StatsMini />,
    note: "Then flaunt the number.",
  },
  {
    title: "Your own tier lists",
    body: (
      <>
        How many times has someone asked your favourite show and you
        panic-answered{" "}
        <Underlined variant="strike" className="text-foreground">
          Breaking Bad
        </Underlined>{" "}
        — knowing full well there was an underrated one you liked more? Build as
        many boards as you want, across genres, ranked the way you want.
      </>
    ),
  },
  {
    title: "A profile made of all of it",
    body: (
      <>
        Assembled from what you actually watched, without you filling in a single
        form.
      </>
    ),
  },
  {
    title: "Public profiles, lists and tiers",
    body: <>Make any of it public and send someone a link instead of a summary.</>,
    soon: true,
  },
  {
    title: "Recommend to friends",
    body: (
      <>
        A recommendation lands as a{" "}
        <strong className="font-semibold text-foreground">to-do</strong>, not
        another reel buried three days deep in a chat.
      </>
    ),
    note: "So recommend wisely.",
    soon: true,
  },
] as const;

function FeatureList() {
  return (
    <section
      className="relative border-t border-border"
      style={{ background: "var(--bg2)" }}
    >
      {/* Flex + gap, not `mb-*` on the heading: `.text-sheen` carries a negative
          margin-bottom (see globals.css) which would override a margin utility. */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 sm:px-8 py-20 sm:py-28 flex flex-col gap-12 sm:gap-16">
        <h2 className="display-section text-sheen">
          So now you get an app with —
        </h2>

        {/*
          Row-major 2-col grid: 01 02 across the top, then 03 04, and so on.

          This deliberately went through multicol (which packs with zero gaps) and
          back, because multicol is inherently COLUMN-major — it gave 01-04 down
          one column and 05-08 down the other, which is not the reading order this
          list wants.

          Grid rows align by definition, so cards in a row share a height. The
          reason that looked broken before wasn't the stretching itself — it was
          card 04, which the stats figure made 294px against its row-mate's 163px,
          an 80% pad. The fix is upstream: `StatsMini` is now one compact line, so
          no card is a dramatic outlier and equal-height rows read as deliberate
          rather than as padded empty boxes.
        */}
        <ol className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {ITEMS.map((item, i) => (
            <li
              key={item.title}
              className={`glass edge-glow reveal p-6 sm:p-7 flex flex-col gap-3 ${
                i % 3 === 1 ? "reveal-2" : i % 3 === 2 ? "reveal-3" : ""
              }`}
              style={{ borderRadius: "var(--radius-hero)" }}
            >
              <div className="flex items-center gap-3">
                <span className="grad-text font-display font-extrabold text-2xl tabular-nums leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display font-bold text-lg sm:text-xl tracking-[-0.02em] leading-tight flex-1 min-w-0">
                  {item.title}
                </h3>
                {"soon" in item && item.soon && <SoonBadge />}
              </div>

              <p className="text-body text-sm leading-relaxed">{item.body}</p>

              {"visual" in item && item.visual}

              {"note" in item && item.note && (
                <p className="hand-note text-xl sm:text-2xl text-foreground mt-auto pt-1">
                  {item.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Honest label for a feature that isn't shipped. Deliberately plain. */
function SoonBadge() {
  return (
    <span
      className="shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold tracking-[0.1em] uppercase text-meta border border-border"
      style={{ background: "var(--surface)" }}
    >
      Not yet
    </span>
  );
}

/* ─── The money question ─────────────────────────────────────────────────
   The owner's line, kept verbatim, because hedging it would defeat the point. */

function FreeSection() {
  return (
    <section
      id="free"
      className="relative isolate grain border-t border-border scroll-mt-8"
    >
      <div className="aurora aurora-warm" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 sm:px-8 py-24 sm:py-32 flex flex-col items-center text-center gap-8">
        <span className="float-slower">
          <BrandMark size={44} />
        </span>

        <h2 className="display-section text-sheen">
          So how is all of this free?
        </h2>

        <p className="hand-note font-hand grad-text text-3xl sm:text-5xl leading-tight">
          It won&apos;t cost you until it costs me.
        </p>

        <p className="text-body text-base leading-relaxed max-w-lg">
          This is a hobby project. It&apos;s small, it&apos;s free to run right
          now, and that&apos;s fine. Later, everyone gets greedy — but if that day
          ever comes you&apos;ll hear it from me first, not from a paywall that
          appeared overnight.
        </p>

        <div className="relative mt-2">
          {/*
            `early` because this sits in the last screenful: the page runs out of
            scroll before the default range finishes, so the arrow would otherwise
            still be drawing when you stop.

            Shown on phones too. It was `hidden sm:block` on the assumption there
            was no room, which measurement disproved — a 375px viewport leaves
            106px clear to the left of the centred button. The offset does have to
            shrink though: at the desktop `-left-24` (96px) a 320px screen has only
            ~78px of clearance and the arrow would push the page into horizontal
            scroll. 64px/56px wide clears both.
          */}
          <Scribble
            variant="arrow"
            early
            className="absolute -left-16 -top-4 w-14 h-11 sm:-left-24 sm:-top-6 sm:w-20 sm:h-16 text-meta"
            opacity={0.7}
          />
          <GradientCta href="/signup" size="lg">
            Sign up
          </GradientCta>
        </div>

        <p className="text-meta text-sm">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground font-semibold underline underline-offset-4"
          >
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <BrandLockup size={22} />
        <p className="text-meta text-xs">
          Catalogue data from TMDB. Built for Indian viewers.
        </p>
      </div>
    </footer>
  );
}
