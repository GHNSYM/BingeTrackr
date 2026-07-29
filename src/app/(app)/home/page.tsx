import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, Bookmark, Compass, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContinueWatchingCard } from "@/components/trackr/ContinueWatchingCard";
import { HeroCarousel, type HeroItem } from "@/components/trackr/HeroCarousel";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { requireOnboardedUser } from "@/lib/auth/require-user";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  titleFromResult,
  trendingInRegion,
  yearFromResult,
} from "@/lib/tmdb/client";
import {
  getContinueWatching,
  getMonthActivity,
  getOnThisDay,
  getQuickTrackStates,
  getRecentlyWatched,
  getWatchlistItems,
  quickTrackKey,
  type QuickTrackState,
} from "@/lib/tracking/queries";

/**
 * Two full rows of cards, then it scrolls. 24 keeps the rail long enough to
 * feel deep without pulling progress for shows nobody will scroll to.
 */
const RAIL_LIMIT = 24;
const POSTER_RAIL_LIMIT = 12;
/**
 * Per type, interleaved — 10 slides total. Enough to feel worth swiping without
 * a wall of dots or a minute-long cycle at 4s a slide.
 */
const HERO_PER_TYPE = 5;

export default async function HomePage() {
  // Guard only — the greeting is gone, so nothing needs the profile.
  await requireOnboardedUser();

  const [continueWatching, month, watchlist, recent, onThisDay, trending] =
    await Promise.all([
      getContinueWatching(RAIL_LIMIT),
      getMonthActivity(),
      getWatchlistItems(),
      getRecentlyWatched(POSTER_RAIL_LIMIT),
      getOnThisDay(),
      // Page 1 only — the identical URL Discover already fetches, so the two
      // share one Next fetch-cache entry rather than costing a call each.
      trendingInRegion("IN", "week", 1).catch(() => ({
        movies: [],
        shows: [],
      })),
    ]);

  // Interleave so the hero alternates film and TV instead of front-loading one
  // type — there are no type tabs, so this single feed is the whole hero.
  const heroSource = interleave(
    trending.movies.filter((m) => m.poster_path).slice(0, HERO_PER_TYPE),
    trending.shows.filter((s) => s.poster_path).slice(0, HERO_PER_TYPE),
  );

  const heroTrackStates = await getQuickTrackStates(
    heroSource.map((r) => ({ tmdbId: r.id, tmdbType: r.media_type })),
  );

  const heroItems: HeroItem[] = heroSource.map((r) => ({
    tmdbId: r.id,
    tmdbType: r.media_type,
    title: titleFromResult(r),
    year: yearFromResult(r),
    posterPath: r.poster_path,
    inWatchlist:
      heroTrackStates.get(quickTrackKey(r.media_type, r.id))?.watchlisted ??
      false,
  }));

  const cookieStore = await cookies();
  const posterSize = parsePosterSize(
    cookieStore.get(POSTER_SIZE_COOKIE)?.value,
  );

  const upNext = watchlist.slice(0, POSTER_RAIL_LIMIT);

  /**
   * Watchlist entries are watchlisted and — since getWatchlistItems filters out
   * anything finished — definitionally not watched. So the hover-action state is
   * already known and needs no getQuickTrackStates round-trips.
   */
  const watchlistStates = new Map<string, QuickTrackState>(
    upNext
      .filter((i) => i.tmdbId)
      .map((i) => [
        quickTrackKey(i.tmdbType, i.tmdbId!),
        { watched: false, watchlisted: true },
      ]),
  );

  const hasAnything =
    continueWatching.length > 0 || upNext.length > 0 || recent.length > 0;

  return (
    <main
      data-poster-size={posterSize}
      className="flex-1 w-full flex flex-col gap-10 pb-10"
    >
      {/* Hero carousel — full-bleed, so it sits outside the padded column. */}
      {heroItems.length > 0 && <HeroCarousel items={heroItems} />}

      <div
        className={`px-4 sm:px-6 max-w-6xl mx-auto w-full flex flex-col gap-10 ${
          heroItems.length > 0 ? "" : "pt-6 sm:pt-10"
        }`}
      >
      <Section
        label="Continue watching"
        action={
          continueWatching.length > 0
            ? { href: "/library", label: `${continueWatching.length} in progress` }
            : undefined
        }
      >
        {continueWatching.length > 0 ? (
          <div className="cw-rail">
            {continueWatching.map((item) => (
              <ContinueWatchingCard key={item.mediaId} item={item} />
            ))}
          </div>
        ) : (
          <EmptyContinueWatching showRoutes={!hasAnything} />
        )}
      </Section>

      {/* Stat strip — one line, directly under Continue Watching. */}
      {(month.episodes > 0 || month.movies > 0) && (
        <MonthStrip month={month} />
      )}

      {upNext.length > 0 && (
        <Section
          label="Up next from your watchlist"
          action={{ href: "/library?tab=watchlist", label: "See all" }}
        >
          <TrackablePosterGrid
            variant="rail"
            trackStates={watchlistStates}
            items={upNext.map((i) => ({
              key: i.mediaId,
              title: i.title,
              posterPath: i.posterPath,
              year: i.releaseYear,
              tmdbId: i.tmdbId,
              tmdbType: i.tmdbType,
            }))}
          />
        </Section>
      )}

      {recent.length > 0 && (
        <Section
          label="Recently watched"
          action={{ href: "/library?tab=watched", label: "See all" }}
        >
          <TrackablePosterGrid
            variant="rail"
            items={recent.map((i) => ({
              key: i.mediaId,
              title: i.title,
              posterPath: i.posterPath,
              tmdbId: i.tmdbId,
              tmdbType: i.tmdbType,
              meta: i.meta,
            }))}
          />
        </Section>
      )}

      {onThisDay.length > 0 && (
        <Section label="On this day">
          <TrackablePosterGrid
            variant="rail"
            items={onThisDay.map((i) => ({
              key: i.mediaId,
              title: i.title,
              posterPath: i.posterPath,
              tmdbId: i.tmdbId,
              tmdbType: i.tmdbType,
              meta: i.meta,
            }))}
          />
        </Section>
      )}
      </div>
    </main>
  );
}

/** Alternate two lists so the Trending tab mixes film and TV. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

// ─── Primitives ────────────────────────────────────────────────────────────

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          {label}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="text-xs font-semibold text-meta hover:text-foreground transition inline-flex items-center gap-1 shrink-0"
          >
            {action.label}
            <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** One line, no chrome — reinforces the tracking habit without competing. */
function MonthStrip({
  month,
}: {
  month: { episodes: number; movies: number; minutes: number };
}) {
  const hours = Math.floor(month.minutes / 60);
  const parts: string[] = [];
  if (month.episodes > 0) {
    parts.push(`${month.episodes} episode${month.episodes === 1 ? "" : "s"}`);
  }
  if (month.movies > 0) {
    parts.push(`${month.movies} movie${month.movies === 1 ? "" : "s"}`);
  }
  if (hours > 0) parts.push(`${hours}h`);

  return (
    <Link
      href="/stats"
      className="flex items-baseline gap-2 flex-wrap group -mt-4"
    >
      <span className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        This month
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {parts.join(" · ")}
      </span>
      <span className="text-xs text-meta group-hover:text-foreground transition inline-flex items-center gap-1">
        Stats
        <ArrowRight size={11} aria-hidden />
      </span>
    </Link>
  );
}

/**
 * The empty case is the first thing a new user sees, so it does real work:
 * says what to do, and gives concrete places to go. The route cards drop away
 * once there's anything else on the page to look at.
 */
function EmptyContinueWatching({ showRoutes }: { showRoutes: boolean }) {
  const routes = [
    {
      href: "/discover",
      icon: Compass,
      label: "Discover",
      hint: "Trending in India this week",
    },
    {
      href: "/library?tab=watchlist",
      icon: Bookmark,
      label: "Your watchlist",
      hint: "Things you saved for later",
    },
    {
      href: "/library",
      icon: Library,
      label: "Library",
      hint: "Everything you've tracked",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        className="glass p-6 sm:p-8 flex flex-col gap-3 items-start"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <p className="text-lg font-semibold">Nothing in progress yet.</p>
        <p className="text-body text-sm max-w-md">
          Mark one episode of anything and it lands here — with the next episode
          queued up and a one-tap button. Movies, K-drama, anime, Bollywood,
          regional cinema, whatever you&apos;re into.
        </p>
        <Button asChild className="mt-1">
          <Link href="/discover">Find something to watch</Link>
        </Button>
      </div>

      {showRoutes && (
        <div className="grid gap-3 sm:grid-cols-3">
          {routes.map(({ href, icon: Icon, label, hint }) => (
            <Link
              key={href}
              href={href}
              className="glass flex items-center gap-3 p-4 hover:brightness-125 transition"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <span
                className="grid place-items-center w-9 h-9 shrink-0"
                style={{
                  background: "var(--surface2)",
                  borderRadius: "var(--radius-input)",
                  color: "var(--body)",
                }}
              >
                <Icon size={16} aria-hidden />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{label}</span>
                <span className="text-xs text-meta truncate">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
