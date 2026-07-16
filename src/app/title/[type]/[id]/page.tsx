import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EpisodeProgressWidget } from "@/components/trackr/EpisodeProgressWidget";
import { MarkWatchedButton } from "@/components/trackr/MarkWatchedButton";
import { RateButton } from "@/components/trackr/RateButton";
import { WatchlistButton } from "@/components/trackr/WatchlistButton";
import { createClient } from "@/lib/supabase/server";
import {
  backdropUrl,
  getMovie,
  getTv,
  getWatchProviders,
  posterUrl,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import {
  ensureSeasonCached,
  getUserWatchedEpisodeIds,
} from "@/lib/tmdb/seasons";
import { upsertMovie, upsertTv } from "@/lib/tmdb/upsert";
import {
  getMyRating,
  getShowProgress,
  isInWatchlist,
  isMovieWatched,
} from "@/lib/tracking/actions";

type PageParams = Promise<{ type: string; id: string }>;
type SearchParams = Promise<{ s?: string }>;

// ─── Metadata (for OG previews when shared) ────────────────────────────────

export async function generateMetadata({ params }: { params: PageParams }) {
  const { type, id } = await params;
  if (type !== "movie" && type !== "tv") return {};

  try {
    const data = type === "movie" ? await getMovie(id) : await getTv(id);
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
  } catch {
    return { title: "BingeTrackr" };
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────

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

  // Fetch details + upsert into our catalog.
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
  } catch {
    notFound();
  }

  // Signed-in? Different CTAs, and we hydrate progress state.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Watch providers for India — best-effort.
  const providers = await getWatchProviders(type, id).catch(() => null);
  const flatrateIN = providers?.results?.["IN"]?.flatrate ?? [];

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

  // ── TV-only data ─────────────────────────────────────────────────────────
  let tvData: {
    currentSeason: number;
    seasonEpisodes: Awaited<ReturnType<typeof ensureSeasonCached>>;
    watchedIds: Set<string>;
    progress: Awaited<ReturnType<typeof getShowProgress>>;
    totalEpisodes: number;
  } | null = null;

  if (type === "tv") {
    const tv = details as TmdbTvDetails;
    // Pick the season to view: URL param > user's current season > first real season.
    const progress = user ? await getShowProgress(ourMediaId) : null;
    const seasonFromParam = s ? parseInt(s, 10) : null;
    const chosenSeason =
      seasonFromParam && Number.isFinite(seasonFromParam)
        ? seasonFromParam
        : progress?.current_season ?? firstRealSeason(tv);

    const seasonEpisodes = await ensureSeasonCached(
      ourMediaId,
      id,
      chosenSeason,
    );
    const watchedIds = user
      ? await getUserWatchedEpisodeIds(ourMediaId)
      : new Set<string>();

    tvData = {
      currentSeason: chosenSeason,
      seasonEpisodes,
      watchedIds,
      progress,
      totalEpisodes: tv.number_of_episodes ?? 0,
    };
  }

  const movieWatched =
    type === "movie" && user ? await isMovieWatched(ourMediaId) : false;

  // Watchlist + rating apply to BOTH types.
  const [inWatchlist, myRating] = user
    ? await Promise.all([isInWatchlist(ourMediaId), getMyRating(ourMediaId)])
    : [false, null];

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
                {type === "movie" && (
                  <MarkWatchedButton
                    mediaId={ourMediaId}
                    initiallyWatched={movieWatched}
                  />
                )}
                <WatchlistButton
                  mediaId={ourMediaId}
                  initiallyInWatchlist={inWatchlist}
                />
                <RateButton
                  mediaId={ourMediaId}
                  initialScore={myRating}
                />
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

          {/* TV — the founding feature */}
          {type === "tv" && tvData && (
            <div className="mt-8">
              {user ? (
                <EpisodeProgressWidget
                  mediaId={ourMediaId}
                  totalEpisodes={tvData.totalEpisodes}
                  totalWatched={tvData.watchedIds.size}
                  progress={tvData.progress}
                  allSeasons={(details as TmdbTvDetails).seasons}
                  currentSeasonNumber={tvData.currentSeason}
                  currentSeasonEpisodes={tvData.seasonEpisodes.episodes}
                  watchedEpisodeIds={tvData.watchedIds}
                  tmdbTvId={id}
                />
              ) : (
                <div
                  className="glass p-6 flex flex-col gap-3"
                  style={{ borderRadius: "var(--radius-card)" }}
                >
                  <p className="text-lg font-semibold">
                    Sign up to track episodes.
                  </p>
                  <p className="text-body text-sm">
                    Never lose your place again. One-tap Mark Watched, resume from
                    exactly where you stopped, hours-watched stats.
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
              )}
            </div>
          )}

          {/* Where to watch (India) */}
          {flatrateIN.length > 0 && (
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
          )}

          {/* Overview */}
          {details.overview && (
            <section className="mt-8 max-w-3xl">
              <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta mb-3">
                Overview
              </h2>
              <p className="text-body leading-relaxed">{details.overview}</p>
            </section>
          )}

          <div className="h-16" />
        </div>
      </section>
    </main>
  );
}

function firstRealSeason(tv: TmdbTvDetails): number {
  const real = tv.seasons.find((s) => s.season_number > 0);
  return real?.season_number ?? 1;
}
