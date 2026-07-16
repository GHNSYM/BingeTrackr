import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  backdropUrl,
  getMovie,
  getTv,
  getWatchProviders,
  posterUrl,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { upsertMovie, upsertTv } from "@/lib/tmdb/upsert";
import { createClient } from "@/lib/supabase/server";

type PageParams = Promise<{ type: string; id: string }>;
type MetadataArgs = { params: PageParams };

// ─── Metadata (for OG previews when shared) ────────────────────────────────

export async function generateMetadata({ params }: MetadataArgs) {
  const { type, id } = await params;
  if (type !== "movie" && type !== "tv") return {};

  try {
    const data =
      type === "movie" ? await getMovie(id) : await getTv(id);
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
}: {
  params: PageParams;
}) {
  const { type, id } = await params;
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

  // Fetch watch providers for India (best-effort — silently skip on error).
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

  // Are they signed in? Different CTAs for signed-in vs anonymous.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const backdrop = backdropUrl(details.backdrop_path, "w1280");
  const poster = posterUrl(details.poster_path, "w500");

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
            {/* Poster */}
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
                  style={{
                    background: "var(--bg2)",
                    color: "var(--meta)",
                  }}
                >
                  {title[0]}
                </div>
              )}
            </div>

            {/* Title block */}
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

          {/* Action row */}
          <div className="mt-6 flex flex-wrap gap-2">
            {user ? (
              <>
                <Button disabled className="cursor-not-allowed">
                  Mark watched
                </Button>
                <Button variant="outline" disabled className="cursor-not-allowed">
                  + Watchlist
                </Button>
                <Button variant="outline" disabled className="cursor-not-allowed">
                  Rate
                </Button>
                <p className="w-full text-xs text-meta mt-2">
                  Actions wire up in the next session. Media id cached:{" "}
                  <code className="text-foreground">{ourMediaId.slice(0, 8)}</code>
                </p>
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

          {/* TV progress placeholder */}
          {type === "tv" && (
            <section className="mt-8 max-w-3xl glass p-5" style={{ borderRadius: "var(--radius-card)" }}>
              <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta mb-2">
                Episode progress
              </h2>
              <p className="text-body text-sm">
                Season selector, progress bar, and one-tap Mark Watched land next
                session — this is the founding feature and gets its own build day.
              </p>
            </section>
          )}

          <div className="h-16" />
        </div>
      </section>
    </main>
  );
}
