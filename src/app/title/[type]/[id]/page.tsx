import { Suspense } from "react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EpisodeProgressWidget } from "@/components/trackr/EpisodeProgressWidget";
import {
  PosterSectionSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";
import { RateButton } from "@/components/trackr/RateButton";
import { TitleTrackActions } from "@/components/trackr/TitleTrackActions";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { getCurrentUser } from "@/lib/auth/current-user";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  backdropUrl,
  getMovie,
  getTv,
  getWatchProviders,
  isTmdbNotFound,
  posterUrl,
  titleFromResult,
  yearFromResult,
  type TmdbMediaType,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import {
  ensureSeasonCached,
  getUserWatchedEpisodeIds,
} from "@/lib/tmdb/seasons";
import { getTitleRecommendations } from "@/lib/tmdb/recommendations";
import { upsertMovie, upsertTv } from "@/lib/tmdb/upsert";
import {
  getMyRating,
  getShowProgress,
  isInWatchlist,
  isMovieWatched,
} from "@/lib/tracking/actions";
import { getQuickTrackStates } from "@/lib/tracking/queries";

type PageParams = Promise<{ type: string; id: string }>;
type SearchParams = Promise<{ s?: string }>;

// ─── Metadata (for OG previews when shared) ────────────────────────────────

/**
 * Also where a missing title is turned into a real HTTP 404.
 *
 * `loading.tsx` makes this route stream, and once the first byte is flushed the
 * status is already committed — a `notFound()` from the page body then renders
 * the not-found UI under a **200**, which is a soft-404: correct to a human,
 * wrong to a crawler, on an SEO-facing route.
 *
 * Metadata resolves before the response is flushed, so calling `notFound()` here
 * still sets the status properly. The details fetch is shared with the page body
 * through Next's fetch cache, so this validation costs no extra request.
 *
 * Only a genuine TMDB 404 becomes a 404. Anything else — an outage, a rate
 * limit, a bad key — is rethrown so it surfaces as a 500 rather than telling the
 * world the title doesn't exist.
 */
export async function generateMetadata({ params }: { params: PageParams }) {
  const { type, id } = await params;
  if (type !== "movie" && type !== "tv") notFound();

  let data: TmdbMovieDetails | TmdbTvDetails;
  try {
    data = type === "movie" ? await getMovie(id) : await getTv(id);
  } catch (err) {
    if (isTmdbNotFound(err)) notFound();
    throw err;
  }

  const title = "title" in data ? data.title : data.name;
  return {
    title: `${title} — BingeTrackr`,
    description: data.overview?.slice(0, 200) ?? undefined,
    openGraph: {
      title,
      description: data.overview?.slice(0, 200) ?? undefined,
      images: data.poster_path
        ? [{ url: posterUrl(data.poster_path, "w500")! }]
        : undefined,
    },
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────

/**
 * STREAMING SHAPE — read this before adding an `await` to the top level.
 *
 * This page used to await everything before rendering a single byte: details,
 * providers, the season fetch, recommendations (3+ more TMDB calls), then track
 * states. A poster click therefore sat on the *previous* page for the whole
 * chain, which read as a broken link.
 *
 * Now:
 *   - `loading.tsx` covers the segment, so the click paints a shell instantly.
 *   - Only what the hero genuinely needs is awaited here: the details call and
 *     the upsert that yields `ourMediaId` (the action buttons key off it), plus
 *     the cheap single-row user flags.
 *   - Everything with a slow tail — providers, the TV season, recommendations —
 *     lives in its own async component behind `<Suspense>` and streams in.
 *
 * The practical rule: an `await` at the top of this function delays the title
 * and poster for every visitor. If new data isn't needed to render the hero, it
 * belongs in a child with a Suspense boundary, not up here.
 */
export default async function TitleDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { type, id } = await params;
  const { s } = await searchParams;
  if (type !== "movie" && type !== "tv") notFound();

  // Fetch details + upsert into our catalog. Both are on the critical path:
  // the hero needs the details, the action row needs our internal media id.
  let details: TmdbMovieDetails | TmdbTvDetails;
  let ourMediaId: string;
  try {
    if (type === "movie") {
      const movie = await getMovie(id);
      details = movie;
      ourMediaId = await upsertMovie(movie);
    } else {
      const tv = await getTv(id);
      details = tv;
      ourMediaId = await upsertTv(tv);
    }
  } catch (err) {
    // A genuine 404 has already been handled by generateMetadata (with a proper
    // status code), so reaching here for one is unusual but harmless.
    //
    // Everything else is rethrown. This used to be a bare `notFound()`, which
    // silently converted real failures into "title doesn't exist" — and that
    // silence cost real debugging time: after the 2026-07-31 migration added
    // `media_external_ids.media_type NOT NULL`, a dev server still running the
    // pre-migration `upsertMedia` threw on every insert, so EVERY uncached title
    // 404'd with nothing in the logs to say why. An upsert failure is a bug, and
    // bugs should be loud.
    console.error(
      `[title] details/upsert failed for ${type}/${id}:`,
      err instanceof Error ? err.message : err,
    );
    if (isTmdbNotFound(err)) notFound();
    throw err;
  }

  // Signed-in? Different CTAs, and we hydrate progress state.
  const user = await getCurrentUser();

  const title = "title" in details ? details.title : details.name;
  const originalTitle =
    "original_title" in details ? details.original_title : details.original_name;
  const dateStr =
    "release_date" in details ? details.release_date : details.first_air_date;
  const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
  const runtime =
    "runtime" in details
      ? details.runtime
      : details.episode_run_time?.[0] ?? null;
  const rating = Math.round(details.vote_average * 10) / 10;

  const backdrop = backdropUrl(details.backdrop_path, "w1280");
  const poster = posterUrl(details.poster_path, "w500");

  // Cheap single-row reads against the same user — these decide the initial
  // state of the optimistic buttons, so they'd flicker if streamed.
  //
  // `showProgress` is fetched here rather than only inside the streamed TV
  // section because the action row needs to know whether the series is
  // Completed: watched and watchlisted are mutually exclusive, so a completed
  // series must block the watchlist button. It's passed down so the streamed
  // section doesn't re-query it.
  const [movieWatched, inWatchlist, myRating, showProgress] = user
    ? await Promise.all([
        type === "movie" ? isMovieWatched(ourMediaId) : Promise.resolve(false),
        isInWatchlist(ourMediaId),
        getMyRating(ourMediaId),
        type === "tv" ? getShowProgress(ourMediaId) : Promise.resolve(null),
      ])
    : [false, false, null, null];

  return (
    <main className="flex-1 flex flex-col">
      {/* Hero — blurred backdrop + poster + title */}
      <section className="relative">
        <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden">
          {backdrop ? (
            <>
              <Image
                src={backdrop}
                alt=""
                fill
                priority
                className="object-cover"
                sizes="100vw"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(11,11,13,0.35) 0%, rgba(11,11,13,0.75) 60%, var(--bg) 100%)",
                }}
              />
            </>
          ) : (
            <div className="w-full h-full" style={{ background: "var(--bg2)" }} />
          )}
        </div>

        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 -mt-40 sm:-mt-32 relative z-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div
              className="shrink-0 overflow-hidden"
              style={{
                width: 180,
                height: 270,
                borderRadius: "var(--radius-hero)",
                boxShadow: "var(--shadow)",
              }}
            >
              {poster ? (
                <Image
                  src={poster}
                  alt={title}
                  width={180}
                  height={270}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div
                  className="w-full h-full grid place-items-center text-6xl font-extrabold"
                  style={{ background: "var(--bg2)", color: "var(--meta)" }}
                >
                  {title[0]}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
                {type === "movie" ? "Movie" : "TV Series"}
                {year && ` · ${year}`}
                {runtime ? ` · ${runtime}m` : ""}
              </p>
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
                {title}
              </h1>
              {originalTitle && originalTitle !== title && (
                <p className="text-body italic">{originalTitle}</p>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">★ {rating.toFixed(1)}</span>
                <span className="text-meta">· TMDB</span>
              </div>
            </div>
          </div>

          {/* Action row — Watchlist + Rate live on BOTH movie and TV.
              Mark-watched is movie-only (episode marking lives in the widget). */}
          <div className="mt-6 flex flex-wrap gap-2">
            {user ? (
              <>
                <TitleTrackActions
                  mediaId={ourMediaId}
                  type={type}
                  initiallyWatched={movieWatched}
                  initiallyInWatchlist={inWatchlist}
                  seriesCompleted={showProgress?.status === "completed"}
                />
                <RateButton mediaId={ourMediaId} initialScore={myRating} />
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href="/signup">Sign up to track</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/login">Log in</Link>
                </Button>
              </>
            )}
          </div>

          {/* TV — the founding feature. Streams because `ensureSeasonCached`
              does a TMDB /season call plus episode upserts; the skeleton keeps
              its full height so the sections below don't shift. */}
          {type === "tv" && (
            <div className="mt-8">
              {user ? (
                <Suspense fallback={<EpisodeWidgetSkeleton />}>
                  <TvProgressSection
                    tv={details as TmdbTvDetails}
                    tmdbTvId={id}
                    ourMediaId={ourMediaId}
                    seasonParam={s}
                    progress={showProgress}
                  />
                </Suspense>
              ) : (
                <SignUpToTrackCard />
              )}
            </div>
          )}

          <Suspense fallback={<WhereToWatchSkeleton />}>
            <WhereToWatch type={type} id={id} />
          </Suspense>

          {/* Overview */}
          {details.overview && (
            <section className="mt-8 max-w-3xl">
              <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta mb-3">
                Overview
              </h2>
              <p className="text-body leading-relaxed">{details.overview}</p>
            </section>
          )}

          <Suspense
            fallback={
              <div className="mt-10">
                <PosterSectionSkeleton count={6} labelWidth={120} />
              </div>
            }
          >
            <Recommendations
              type={type}
              id={id}
              details={details}
              signedIn={!!user}
            />
          </Suspense>

          <div className="h-16" />
        </div>
      </section>
    </main>
  );
}

// ─── Streamed sections ─────────────────────────────────────────────────────

/**
 * Episode progress. Three awaits, one of which (`ensureSeasonCached`) can hit
 * TMDB and write episode rows.
 */
async function TvProgressSection({
  tv,
  tmdbTvId,
  ourMediaId,
  seasonParam,
  progress,
}: {
  tv: TmdbTvDetails;
  tmdbTvId: string;
  ourMediaId: string;
  seasonParam?: string;
  /** Already fetched by the page for the action row — don't re-query it. */
  progress: Awaited<ReturnType<typeof getShowProgress>>;
}) {
  // Pick the season to view: URL param > user's current season > first real season.
  const seasonFromParam = seasonParam ? parseInt(seasonParam, 10) : null;
  const chosenSeason =
    seasonFromParam && Number.isFinite(seasonFromParam)
      ? seasonFromParam
      : progress?.current_season ?? firstRealSeason(tv);

  const [seasonEpisodes, watchedIds] = await Promise.all([
    ensureSeasonCached(ourMediaId, tmdbTvId, chosenSeason),
    getUserWatchedEpisodeIds(ourMediaId),
  ]);

  return (
    <EpisodeProgressWidget
      mediaId={ourMediaId}
      totalEpisodes={tv.number_of_episodes ?? 0}
      totalWatched={watchedIds.size}
      progress={progress}
      allSeasons={tv.seasons}
      currentSeasonNumber={chosenSeason}
      currentSeasonEpisodes={seasonEpisodes.episodes}
      watchedEpisodeIds={watchedIds}
      tmdbTvId={tmdbTvId}
    />
  );
}

/** Where to watch (India). One TMDB call, best-effort. */
async function WhereToWatch({
  type,
  id,
}: {
  type: TmdbMediaType;
  id: string;
}) {
  const providers = await getWatchProviders(type, id).catch(() => null);
  const flatrateIN = providers?.results?.["IN"]?.flatrate ?? [];
  if (flatrateIN.length === 0) return null;

  return (
    <section className="mt-8 flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        Where to watch · India
      </h2>
      <div className="flex flex-wrap gap-2">
        {flatrateIN.map((p) => (
          <div
            key={p.provider_id}
            className="flex items-center gap-2 px-3 py-2"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-input)",
            }}
          >
            {p.logo_path && (
              <Image
                src={posterUrl(p.logo_path, "w185") ?? ""}
                alt=""
                width={24}
                height={24}
                className="rounded"
              />
            )}
            <span className="text-sm font-medium">{p.provider_name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Franchise-first recommendations. The slowest thing on the page — up to three
 * TMDB calls (`/collection`, `/recommendations`, `/similar`) plus a
 * `getQuickTrackStates` for the hover buttons. Streaming it is what lets the
 * hero paint early.
 */
async function Recommendations({
  type,
  id,
  details,
  signedIn,
}: {
  type: TmdbMediaType;
  id: string;
  details: TmdbMovieDetails | TmdbTvDetails;
  signedIn: boolean;
}) {
  const recommendations = await getTitleRecommendations(
    type,
    id,
    details,
  ).catch(() => []);
  if (recommendations.length === 0) return null;

  const recTrackStates = signedIn
    ? await getQuickTrackStates(
        recommendations.flatMap((section) =>
          section.items.map((r) => ({
            tmdbId: r.id,
            tmdbType: r.media_type,
          })),
        ),
      )
    : undefined;

  // Recommendation grids honour the global poster-size preference.
  const cookieStore = await cookies();
  const posterSize = parsePosterSize(
    cookieStore.get(POSTER_SIZE_COOKIE)?.value,
  );

  return (
    <div data-poster-size={posterSize} className="mt-10 flex flex-col gap-10">
      {recommendations.map((section) => (
        <section key={section.label} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            {section.label}
          </h2>
          <TrackablePosterGrid
            trackStates={recTrackStates}
            items={section.items.map((r) => ({
              key: `${r.media_type}-${r.id}`,
              title: titleFromResult(r),
              posterPath: r.poster_path,
              year: yearFromResult(r),
              tmdbId: r.id,
              tmdbType: r.media_type,
            }))}
          />
        </section>
      ))}
    </div>
  );
}

// ─── Static bits ───────────────────────────────────────────────────────────

function SignUpToTrackCard() {
  return (
    <div
      className="glass p-6 flex flex-col gap-3"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">Sign up to track episodes.</p>
      <p className="text-body text-sm">
        Never lose your place again. One-tap Mark Watched, resume from exactly
        where you stopped, hours-watched stats.
      </p>
      <div className="flex gap-2 mt-2">
        <Button asChild>
          <Link href="/signup">Sign up free</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </div>
  );
}

/** Approximates the EpisodeProgressWidget box: header, bar, a few rows. */
function EpisodeWidgetSkeleton() {
  return (
    <div
      className="glass p-6 flex flex-col gap-4"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton h={16} w={180} />
        <Skeleton h={16} w={70} />
      </div>
      <Skeleton h={8} w="100%" />
      <div className="flex flex-col gap-3 mt-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton h={28} w={28} radius="999px" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton h={13} w={i % 2 ? "55%" : "70%"} />
              <Skeleton h={10} w={90} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhereToWatchSkeleton() {
  return (
    <section className="mt-8 flex flex-col gap-3">
      <Skeleton h={11} w={170} />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} h={40} w={120} />
        ))}
      </div>
    </section>
  );
}

function firstRealSeason(tv: TmdbTvDetails): number {
  const real = tv.seasons.find((s) => s.season_number > 0);
  return real?.season_number ?? 1;
}
