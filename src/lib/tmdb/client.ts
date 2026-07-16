/**
 * TMDB API client — server-side only.
 *
 * Uses TMDB v4 read access token (Bearer auth). Get one at
 * https://www.themoviedb.org/settings/api
 *
 * We NEVER cache the raw TMDB response into our DB except via the upsert
 * helper (see lib/tmdb/upsert.ts). Per TMDB ToS, don't mirror the catalog.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

export type TmdbMediaType = "movie" | "tv";

export type TmdbSearchResult = {
  id: number;
  media_type: TmdbMediaType | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
};

export type TmdbMovieDetails = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  vote_average: number;
  original_language: string;
};

export type TmdbTvSeasonSummary = {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
};

export type TmdbTvDetails = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  genres: { id: number; name: string }[];
  vote_average: number;
  original_language: string;
  seasons: TmdbTvSeasonSummary[];
};

export type TmdbWatchProviders = {
  results: Record<
    string,
    {
      link?: string;
      flatrate?: TmdbProvider[];
      rent?: TmdbProvider[];
      buy?: TmdbProvider[];
      ads?: TmdbProvider[];
    }
  >;
};

export type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

// ─── Fetch wrapper ─────────────────────────────────────────────────────────

async function tmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options?: { revalidateSeconds?: number },
): Promise<T> {
  const token = process.env.TMDB_API_KEY;
  if (!token) {
    throw new Error("TMDB_API_KEY missing — copy .env.local.example to .env.local");
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    // Next.js fetch cache — default to 1h revalidate for catalogue data.
    next: { revalidate: options?.revalidateSeconds ?? 60 * 60 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TMDB ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function searchMulti(query: string) {
  const data = await tmdb<{ results: TmdbSearchResult[] }>(
    "/search/multi",
    { query, include_adult: "false" },
    // Search doesn't benefit from caching much; keep short.
    { revalidateSeconds: 60 },
  );
  // Drop person results — this is a media tracker.
  return data.results.filter(
    (r) => r.media_type === "movie" || r.media_type === "tv",
  );
}

export async function trendingInRegion(
  region: string = "IN",
  window: "day" | "week" = "week",
) {
  // TMDB /trending doesn't accept region — filter by original_language 'hi'
  // + surrounding trending signal by pulling both movie + tv day trending.
  const [movies, tv] = await Promise.all([
    tmdb<{ results: TmdbSearchResult[] }>(`/trending/movie/${window}`, {
      region,
    }),
    tmdb<{ results: TmdbSearchResult[] }>(`/trending/tv/${window}`, {
      region,
    }),
  ]);
  return [
    ...movies.results.map((r) => ({ ...r, media_type: "movie" as const })),
    ...tv.results.map((r) => ({ ...r, media_type: "tv" as const })),
  ].sort(
    (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0),
  );
}

export function getMovie(tmdbId: number | string) {
  return tmdb<TmdbMovieDetails>(`/movie/${tmdbId}`, undefined, {
    revalidateSeconds: 60 * 60 * 24, // 24h
  });
}

export function getTv(tmdbId: number | string) {
  return tmdb<TmdbTvDetails>(`/tv/${tmdbId}`, undefined, {
    revalidateSeconds: 60 * 60 * 24,
  });
}

export function getWatchProviders(
  type: TmdbMediaType,
  tmdbId: number | string,
) {
  return tmdb<TmdbWatchProviders>(
    `/${type}/${tmdbId}/watch/providers`,
    undefined,
    { revalidateSeconds: 60 * 60 * 24 * 7 }, // 7d
  );
}

export type TmdbSeasonDetails = {
  id: number;
  season_number: number;
  name: string;
  air_date: string | null;
  episodes: TmdbEpisode[];
};

export type TmdbEpisode = {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
};

export function getSeason(tvId: number | string, seasonNumber: number) {
  return tmdb<TmdbSeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}`,
    undefined,
    { revalidateSeconds: 60 * 60 * 24 }, // 24h
  );
}

// ─── Image URL builders ────────────────────────────────────────────────────

export function posterUrl(
  path: string | null | undefined,
  size: "w185" | "w342" | "w500" | "w780" | "original" = "w342",
) {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

export function backdropUrl(
  path: string | null | undefined,
  size: "w780" | "w1280" | "original" = "w1280",
) {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

// ─── Small helpers ─────────────────────────────────────────────────────────

export function yearFromResult(r: TmdbSearchResult): number | null {
  const date =
    r.release_date ?? r.first_air_date ?? "";
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function titleFromResult(r: TmdbSearchResult): string {
  return r.title ?? r.name ?? "Untitled";
}

export function originalTitleFromResult(r: TmdbSearchResult): string | null {
  return r.original_title ?? r.original_name ?? null;
}
