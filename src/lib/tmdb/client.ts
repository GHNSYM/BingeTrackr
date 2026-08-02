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

/**
 * A non-2xx from TMDB, carrying the status so callers can tell "this title does
 * not exist" (404) from "TMDB is having a bad day" (5xx / 429).
 *
 * That distinction is load-bearing on the title page: a 404 must render the
 * not-found page, while an outage must surface as an error. Collapsing both into
 * `notFound()` would quietly tell users their titles had vanished during a TMDB
 * incident, and would let search engines de-index real pages.
 */
export class TmdbError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body?: string,
  ) {
    super(`TMDB ${status} on ${path}${body ? `: ${body}` : ""}`);
    this.name = "TmdbError";
  }
}

/** True when TMDB says the resource genuinely doesn't exist. */
export function isTmdbNotFound(err: unknown): boolean {
  return err instanceof TmdbError && err.status === 404;
}

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
    throw new TmdbError(res.status, path, body.slice(0, 200));
  }
  return (await res.json()) as T;
}

// ─── Public API ────────────────────────────────────────────────────────────

/** TMDB serves 20 results per page on both /search and /trending. */
export const TMDB_PAGE_SIZE = 20;

/**
 * Hard ceiling on `page`. Past this TMDB returns a **400**, not an empty list
 * ("Invalid page: Pages start at 1 and max at 500"), so paginated UI must clamp
 * rather than rely on `tmdbPaged`'s empty-results tolerance. Within range but
 * past the end is fine — `total_pages: 120` asked for page 400 returned 200 with
 * zero results.
 */
export const TMDB_MAX_PAGE = 500;

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

// ─── Discover ──────────────────────────────────────────────────────────────

/**
 * Sort vocabulary for `discoverTitles`, deliberately *neutral* rather than
 * TMDB's raw `sort_by` strings.
 *
 * TMDB's date sort key differs by type — `primary_release_date.desc` for movies,
 * `first_air_date.desc` for shows — and passing the movie one to `/discover/tv`
 * does not error, it is **silently ignored** (measured: `primary_release_year=2024`
 * on `/discover/tv` returned 228,129 results, i.e. the completely unfiltered
 * total, while `first_air_date_year=2024` returned 15,031). Callers pick a
 * meaning; the per-type key is resolved in exactly one place below.
 */
export type DiscoverSort = "popular" | "rating" | "newest" | "votes";

/**
 * Typed params for `/discover/movie` and `/discover/tv`.
 *
 * WHY THIS TYPE EXISTS — the whole argument for the shared fetcher.
 *
 * TMDB **ignores unknown query params silently and returns 200**: a request with
 * `with_bogus_thing=x` came back with the full 1,164,683-result unfiltered total,
 * no warning. A typo in a filter therefore doesn't fail — it quietly widens the
 * row to "everything", and looks like a working feature. Every browse axis
 * routing through this one typed surface is what makes that class of bug
 * impossible instead of merely unlikely.
 *
 * Multi-value fields (`genres`, `originalLanguages`, `watchProviders`) are joined
 * with `|` = OR. TMDB also accepts `,` = AND for genres (verified: `28` → 49,302
 * results, `28|878` → 70,573, `28,878` → 5,571) but no browse row wants AND, so
 * it isn't exposed.
 */
export type DiscoverParams = {
  sort?: DiscoverSort;
  /** Genre ids. NOTE: the id sets differ by type — see `getGenres`. */
  genres?: (number | string)[];
  /** ISO 639-1 codes, e.g. `["hi"]` or `["ta", "te", "ml", "kn"]`. */
  originalLanguages?: string[];
  /** TMDB provider ids. Requires `watchRegion`. */
  watchProviders?: (number | string)[];
  /** ISO 3166-1, e.g. `"IN"`. Only meaningful with `watchProviders`. */
  watchRegion?: string;
  /**
   * Minimum vote count. **Effectively mandatory whenever `sort` is `"rating"`.**
   * Without it `vote_average.desc` returns titles with a single 10/10 vote — the
   * top five of an unfiltered rating sort were all 1-vote films nobody has heard
   * of. It is also worth setting on `"popular"` rows scoped to a small
   * population: `popularity.desc` on Indian-language TV surfaced serials with
   * `0.0/0` ratings and no posters.
   */
  minVotes?: number;
  /** Inclusive release-year range. Mapped to the right date key per type. */
  yearFrom?: number;
  yearTo?: number;
  /**
   * ISO `yyyy-mm-dd` upper bound, taking precedence over `yearTo`. Exists for
   * "newest" rows: a bare date-descending sort is happy to lead with titles
   * scheduled for 2029, so the row has to be capped at today to mean
   * "already out".
   */
  dateTo?: string;
};

const SORT_KEYS: Record<DiscoverSort, Record<TmdbMediaType, string>> = {
  popular: { movie: "popularity.desc", tv: "popularity.desc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
  votes: { movie: "vote_count.desc", tv: "vote_count.desc" },
  newest: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
};

/** The date field `/discover` filters on, which is not the same for both types. */
const DATE_KEY: Record<TmdbMediaType, string> = {
  movie: "primary_release_date",
  tv: "first_air_date",
};

function discoverQuery(
  type: TmdbMediaType,
  p: DiscoverParams,
): Record<string, string | number | undefined> {
  const dateKey = DATE_KEY[type];
  const join = (v?: (number | string)[]) =>
    v && v.length > 0 ? v.join("|") : undefined;

  return {
    sort_by: SORT_KEYS[p.sort ?? "popular"][type],
    // Defaults to false already; stated explicitly so it survives a TMDB change.
    include_adult: "false",
    with_genres: join(p.genres),
    with_original_language: join(p.originalLanguages),
    with_watch_providers: join(p.watchProviders),
    watch_region: p.watchProviders?.length ? p.watchRegion : undefined,
    "vote_count.gte": p.minVotes,
    [`${dateKey}.gte`]: p.yearFrom ? `${p.yearFrom}-01-01` : undefined,
    [`${dateKey}.lte`]:
      p.dateTo ?? (p.yearTo ? `${p.yearTo}-12-31` : undefined),
  };
}

/**
 * The single browse fetcher. Every Discover row is this function with a
 * different `DiscoverParams` — see `src/lib/discover/axes.ts` for the configs.
 *
 * Posterless results are dropped: roughly 1–2 of every 20 rows come back with
 * `poster_path: null`, and a poster grid is the only thing we render, so an
 * entry with no art is a hole in the row rather than a result.
 */
export async function discoverTitles(
  type: TmdbMediaType,
  params: DiscoverParams = {},
  pages = 1,
): Promise<TmdbMediaSearchResult[]> {
  const results = await tmdbPaged(
    `/discover/${type}`,
    discoverQuery(type, params),
    pages,
    // Browse rows shift slowly; 6h keeps the fetch-cache warm across visitors
    // without pinning a "newest" row to yesterday's list.
    { revalidateSeconds: 60 * 60 * 6 },
  );
  return dedupeById(
    results
      .filter((r) => r.poster_path)
      .map((r) => ({ ...r, media_type: type })),
  );
}

export type DiscoverPageResult = {
  results: TmdbMediaSearchResult[];
  /**
   * Total *app* pages, already clamped. TMDB reports `total_pages` off its own
   * 20-per-page numbering and hard-errors past 500, so the raw value is not
   * safe to hand to a paginator.
   */
  totalPages: number;
};

/**
 * Paginated `discoverTitles`, for the drilled-into grid.
 *
 * One app page is `perPage` TMDB pages (2 by default = ~40 posters), because a
 * grid that shows 20 after a rail that showed 20 doesn't feel like "see all".
 * The page count is derived rather than trusted: TMDB returns 400 past page 500,
 * so both the requested pages and the reported total are clamped to it.
 */
export async function discoverTitlesPage(
  type: TmdbMediaType,
  params: DiscoverParams,
  page: number,
  perPage = 2,
): Promise<DiscoverPageResult> {
  const query = discoverQuery(type, params);
  const first = Math.min((page - 1) * perPage + 1, TMDB_MAX_PAGE);

  const responses = await Promise.all(
    Array.from({ length: perPage }, (_, i) => first + i)
      .filter((p) => p <= TMDB_MAX_PAGE)
      .map((p) =>
        tmdb<{ results: TmdbSearchResult[]; total_pages: number }>(
          `/discover/${type}`,
          { ...query, page: p },
          { revalidateSeconds: 60 * 60 * 6 },
        ).catch(() => ({ results: [] as TmdbSearchResult[], total_pages: 0 })),
      ),
  );

  const tmdbTotal = Math.min(
    Math.max(...responses.map((r) => r.total_pages ?? 0), 0),
    TMDB_MAX_PAGE,
  );

  return {
    results: dedupeById(
      responses
        .flatMap((r) => r.results ?? [])
        .filter((r) => r.poster_path)
        .map((r) => ({ ...r, media_type: type })),
    ),
    totalPages: Math.max(1, Math.ceil(tmdbTotal / perPage)),
  };
}

export type TmdbGenre = { id: number; name: string };

/**
 * Genre id → name for one media type.
 *
 * The two lists are **not interchangeable**: movies have 19 genres, TV has 16,
 * and the overlap is partial — movie `28 Action` has no TV equivalent, TV uses
 * `10759 Action & Adventure`. Never reuse a movie genre id on a TV row.
 */
export async function getGenres(type: TmdbMediaType): Promise<TmdbGenre[]> {
  const { genres } = await tmdb<{ genres: TmdbGenre[] }>(
    `/genre/${type}/list`,
    undefined,
    { revalidateSeconds: 60 * 60 * 24 * 7 }, // 7d — this list barely changes
  );
  return genres ?? [];
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
