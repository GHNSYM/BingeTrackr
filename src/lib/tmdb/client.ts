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

export type TmdbMediaSearchResult = TmdbSearchResult & {
  media_type: TmdbMediaType;
};

/** TMDB's franchise grouping — "The Fast and the Furious Collection" etc. */
export type TmdbCollectionRef = {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
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
  belongs_to_collection: TmdbCollectionRef | null;
};

export type TmdbCollectionDetails = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TmdbSearchResult[];
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

/** TMDB serves 20 results per page on both /search and /trending. */
export const TMDB_PAGE_SIZE = 20;

/**
 * Fetch `pages` pages of a paginated list endpoint in parallel and concatenate.
 * Out-of-range pages come back with an empty `results` array (TMDB doesn't
 * error until page 500), so short lists just yield fewer items. One page
 * failing doesn't sink the rest.
 */
async function tmdbPaged(
  path: string,
  params: Record<string, string | number | undefined>,
  pages: number,
  options?: { revalidateSeconds?: number },
): Promise<TmdbSearchResult[]> {
  const responses = await Promise.all(
    Array.from({ length: Math.max(1, pages) }, (_, i) =>
      tmdb<{ results: TmdbSearchResult[] }>(
        path,
        { ...params, page: i + 1 },
        options,
      ).catch(() => ({ results: [] as TmdbSearchResult[] })),
    ),
  );
  return responses.flatMap((r) => r.results ?? []);
}

/** Same title can appear on more than one page as the list shifts under us. */
function dedupeById(
  results: TmdbMediaSearchResult[],
): TmdbMediaSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.media_type}-${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchMulti(
  query: string,
  pages = 1,
): Promise<TmdbMediaSearchResult[]> {
  const results = await tmdbPaged(
    "/search/multi",
    { query, include_adult: "false" },
    pages,
    // Search doesn't benefit from caching much; keep short.
    { revalidateSeconds: 60 },
  );
  // Drop person results — this is a media tracker.
  return dedupeById(
    results.filter(
      (r): r is TmdbMediaSearchResult =>
        r.media_type === "movie" || r.media_type === "tv",
    ),
  );
}

export type TrendingBuckets = {
  movies: TmdbMediaSearchResult[];
  shows: TmdbMediaSearchResult[];
};

/**
 * Trending movies and shows, kept in separate buckets and in TMDB's own
 * trending order. Callers used to get one merged array re-sorted by
 * `vote_average`, which put obscure high-scoring titles above genuinely
 * trending ones — worse the more pages you pull.
 */
export async function trendingInRegion(
  region: string = "IN",
  window: "day" | "week" = "week",
  pages = 1,
): Promise<TrendingBuckets> {
  // TMDB /trending doesn't accept region — filter by original_language 'hi'
  // + surrounding trending signal by pulling both movie + tv day trending.
  const [movies, tv] = await Promise.all([
    tmdbPaged(`/trending/movie/${window}`, { region }, pages),
    tmdbPaged(`/trending/tv/${window}`, { region }, pages),
  ]);
  return {
    movies: dedupeById(
      movies.map((r) => ({ ...r, media_type: "movie" as const })),
    ),
    shows: dedupeById(tv.map((r) => ({ ...r, media_type: "tv" as const }))),
  };
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

/**
 * All entries in a franchise, in release order. This is what makes
 * "more Fast & Furious" possible — TMDB models it explicitly, so we don't have
 * to infer a universe from genres.
 */
export function getCollection(collectionId: number | string) {
  return tmdb<TmdbCollectionDetails>(`/collection/${collectionId}`, undefined, {
    revalidateSeconds: 60 * 60 * 24 * 7, // 7d — franchises don't change often
  });
}

/**
 * TMDB's editorial recommendations, which lean on what people actually watch
 * together. `/similar` is the genre-and-keyword fallback when that's thin.
 */
export function getRecommendations(
  type: TmdbMediaType,
  tmdbId: number | string,
) {
  return tmdb<{ results: TmdbSearchResult[] }>(
    `/${type}/${tmdbId}/recommendations`,
    undefined,
    { revalidateSeconds: 60 * 60 * 24 },
  );
}

export function getSimilar(type: TmdbMediaType, tmdbId: number | string) {
  return tmdb<{ results: TmdbSearchResult[] }>(
    `/${type}/${tmdbId}/similar`,
    undefined,
    { revalidateSeconds: 60 * 60 * 24 },
  );
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
