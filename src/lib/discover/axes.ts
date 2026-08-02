/**
 * Discover's browse vocabulary — the config layer over `discoverTitles`.
 *
 * `DESIGN_ROADMAP.md`: "Almost every row below is the same TMDB endpoint with
 * different query params. Build one `discoverTitles(type, params)` and one
 * reusable browse section component, and every row becomes a config object
 * rather than new code."
 *
 * This is that config. Nothing here fetches; it maps URL state and rail
 * definitions onto `DiscoverParams`. Every id and code below was verified
 * against the live TMDB API on 2026-08-01 — see the notes on
 * `IN_WATCH_PROVIDERS`, which is the set most likely to drift.
 */

import type {
  DiscoverParams,
  DiscoverSort,
  TmdbMediaType,
} from "@/lib/tmdb/client";

// ─── Vocabularies ──────────────────────────────────────────────────────────

export type LanguageOption = {
  /** ISO 639-1, what TMDB's `with_original_language` takes. */
  code: string;
  label: string;
};

/**
 * The strongest differentiator for this audience, and it costs one query param.
 * Order is roughly by output volume on TMDB (`hi` 10,350 movies, `ta` 5,952).
 */
export const INDIAN_LANGUAGES: LanguageOption[] = [
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
];

/**
 * Which language chips to offer per media type.
 *
 * **TMDB barely catalogues regional Indian television.** Counting titles with at
 * least 5 votes: Hindi 346, Tamil 20, Telugu 10, Bengali 15, Malayalam 6,
 * Kannada 1, Marathi 0, Punjabi 0. Offering eight TV language chips would mean
 * offering six that lead to an empty grid, so TV gets the one that works.
 *
 * This is a data limitation, not a product decision — if TMDB's TV coverage
 * improves, widen the list.
 */
export function languagesForType(type: TmdbMediaType): LanguageOption[] {
  if (type === "tv") {
    return INDIAN_LANGUAGES.filter((l) => l.code === "hi");
  }
  return INDIAN_LANGUAGES;
}

/** Grouped as one rail rather than four — the landing page is an overview. */
export const SOUTH_INDIAN_LANGUAGES = ["ta", "te", "ml", "kn"];

export type ProviderOption = { id: number; label: string };

/**
 * Streaming services, in TMDB's own `display_priorities.IN` order — Netflix is
 * literally priority 0 for this region, so leading with it is data, not taste.
 *
 * **These ids are region- and merger-sensitive.** Disney+ Hotstar (122) no
 * longer exists in the IN list; the live feed returns **JioHotstar, id 2336**.
 * Re-derive from `/watch/providers/movie?watch_region=IN` before trusting a
 * guessed id — a wrong one returns 200 with an empty row, not an error.
 */
export const IN_WATCH_PROVIDERS: ProviderOption[] = [
  { id: 8, label: "Netflix" },
  { id: 119, label: "Prime Video" },
  { id: 2336, label: "JioHotstar" },
  { id: 232, label: "Zee5" },
  { id: 237, label: "Sony LIV" },
  { id: 350, label: "Apple TV+" },
  { id: 283, label: "Crunchyroll" },
  { id: 11, label: "MUBI" },
];

export const WATCH_REGION = "IN";

export type DecadeOption = { start: number; label: string };

export const DECADES: DecadeOption[] = [
  { start: 2020, label: "2020s" },
  { start: 2010, label: "2010s" },
  { start: 2000, label: "2000s" },
  { start: 1990, label: "1990s" },
  { start: 1980, label: "1980s" },
];

export const SORT_OPTIONS: { key: DiscoverSort; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "rating", label: "Top rated" },
  { key: "newest", label: "Newest" },
];

// ─── Vote-count floors ─────────────────────────────────────────────────────

/**
 * Minimum vote count per row. This is the single most important number in the
 * file and the roadmap flags it as mandatory, so the values are measured rather
 * than picked:
 *
 * - Unfiltered `vote_average.desc` returns five 1-vote titles rated 10/10.
 * - A floor of **300** (TMDB's own Top-Rated threshold) is still too low — it
 *   ranked "Accidental Partners" (8.98, 331 votes) *above* The Shawshank
 *   Redemption (8.73, 30,893 votes). New releases accumulate a burst of
 *   enthusiast votes and outrank the canon.
 * - **3,000** for film / **1,500** for TV produces the list a user expects:
 *   Shawshank, The Godfather, Schindler's List / Breaking Bad, Arcane,
 *   Chernobyl.
 *
 * Narrowing the population inverts the problem — Indian-language films rarely
 * clear 3,000 votes, and that floor empties the row. At **100** the Hindi row
 * returns DDLJ, 3 Idiots, Like Stars on Earth, 12th Fail. So the floor scales
 * with how narrow the query is.
 */
const RATING_FLOOR = {
  broad: { movie: 3000, tv: 1500 },
  narrowed: { movie: 100, tv: 25 },
} as const;

/**
 * Per-language rating floor, because one "narrowed" number cannot serve eight
 * film industries of wildly different TMDB coverage. Titles returned at each
 * floor, measured 2026-08-01:
 *
 * ```
 * floor:      10     25     50    100    300
 * hi        1747    997    602    288     48
 * ta         675    286    118     29      0
 * te         454    146     47     16      3
 * ml         653    198     44      9      1
 * bn         111     36     17      8      1
 * kn          46     19      9      4      0
 * mr          26      4      3      0      0
 * pa          14      2      1      0      0
 * ```
 *
 * At a flat 100 — the value this started as — Marathi and Punjabi return
 * **zero**, so those chips are dead links, and Kannada returns 4. The rule
 * applied below is "the highest floor that still leaves a browsable grid",
 * and the result is genuinely the canon of each industry rather than noise:
 * Hindi → DDLJ, 3 Idiots; Tamil → Pariyerum Perumal, Visaranai; Malayalam →
 * Kumbalangi Nights; Kannada → Thithi, 777 Charlie; Marathi → Sairat,
 * Natsamrat; Punjabi → Carry On Jatta.
 *
 * A low floor is only dangerous where the catalogue is large enough for a
 * 10-vote fluke to outrank a classic, which is exactly where the floor is high.
 */
const LANGUAGE_RATING_FLOOR: Record<string, number> = {
  hi: 100,
  ta: 50,
  te: 25,
  ml: 25,
  bn: 25,
  kn: 10,
  mr: 10,
  pa: 10,
};

/**
 * A small floor on non-rating rows too. `popularity.desc` scoped to Indian
 * languages surfaced unreleased 2026 titles and TV serials sitting at `0.0/0` —
 * popular by TMDB's page-view metric, useless as a browse row. Excluded from
 * `newest`, where having no votes yet is the entire point.
 */
const POPULAR_FLOOR = 20;

// ─── URL state ─────────────────────────────────────────────────────────────

/**
 * Discover's browse state, parsed from the query string.
 *
 * URL-driven by design (`DESIGN_ROADMAP.md`): every filter is a plain link, so
 * a filtered view is shareable, bookmarkable, back-button-correct, and ships no
 * JavaScript — consistent with the existing zero-JS `SearchBar` and type pills.
 */
export type BrowseQuery = {
  type: TmdbMediaType;
  genre: number | null;
  lang: string | null;
  provider: number | null;
  /** Decade start year, e.g. `1990` for the 1990s. */
  decade: number | null;
  sort: DiscoverSort;
  page: number;
};

export type RawBrowseParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | string[] | undefined): number | null {
  const s = one(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseBrowseQuery(raw: RawBrowseParams): BrowseQuery {
  const type = one(raw.type) === "tv" ? "tv" : "movie";
  const sortRaw = one(raw.sort);
  const sort = SORT_OPTIONS.some((o) => o.key === sortRaw)
    ? (sortRaw as DiscoverSort)
    : "popular";

  const langRaw = one(raw.lang);
  const lang = INDIAN_LANGUAGES.some((l) => l.code === langRaw)
    ? langRaw!
    : null;

  const providerRaw = int(raw.provider);
  const provider = IN_WATCH_PROVIDERS.some((p) => p.id === providerRaw)
    ? providerRaw
    : null;

  const decadeRaw = int(raw.decade);
  const decade = DECADES.some((d) => d.start === decadeRaw) ? decadeRaw : null;

  // Genre ids are validated against the live list by the caller (it has to
  // fetch the names anyway); an unknown id here just returns an empty grid.
  const genre = int(raw.genre);

  const page = Math.max(1, int(raw.page) ?? 1);

  return { type, genre, lang, provider, decade, sort, page };
}

/** Only non-default values reach the URL, so `/discover/browse` stays clean. */
export function buildBrowseHref(q: Partial<BrowseQuery>): string {
  const params = new URLSearchParams();
  if (q.type && q.type !== "movie") params.set("type", q.type);
  if (q.genre != null) params.set("genre", String(q.genre));
  if (q.lang) params.set("lang", q.lang);
  if (q.provider != null) params.set("provider", String(q.provider));
  if (q.decade != null) params.set("decade", String(q.decade));
  if (q.sort && q.sort !== "popular") params.set("sort", q.sort);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  const s = params.toString();
  return s ? `/discover/browse?${s}` : "/discover/browse";
}

/**
 * `BrowseQuery` → `DiscoverParams`. The vote-count floor is derived here rather
 * than being a URL param: it's a correctness constraint on the sort, not a user
 * preference, and letting a URL set `minVotes=0` would just reintroduce the
 * 1-vote-10/10 row.
 */
export function toDiscoverParams(
  q: BrowseQuery,
  todayIso: string,
): DiscoverParams {
  const narrowed =
    q.lang !== null ||
    q.genre !== null ||
    q.provider !== null ||
    q.decade !== null;

  let minVotes: number | undefined;
  if (q.sort === "rating") {
    if (q.lang && q.type === "movie") {
      // A language is the narrowest axis and the one with the widest spread in
      // catalogue size, so it sets the floor when present.
      minVotes = LANGUAGE_RATING_FLOOR[q.lang] ?? RATING_FLOOR.narrowed.movie;
    } else {
      minVotes = RATING_FLOOR[narrowed ? "narrowed" : "broad"][q.type];
    }
  } else if (q.sort === "popular" && q.lang) {
    minVotes = POPULAR_FLOOR;
  }

  return {
    sort: q.sort,
    genres: q.genre != null ? [q.genre] : undefined,
    originalLanguages: q.lang ? [q.lang] : undefined,
    watchProviders: q.provider != null ? [q.provider] : undefined,
    watchRegion: WATCH_REGION,
    minVotes,
    yearFrom: q.decade ?? undefined,
    yearTo: q.decade != null ? q.decade + 9 : undefined,
    // A bare `primary_release_date.desc` is happy to lead with titles scheduled
    // for 2029. "Newest" has to mean "already out".
    dateTo: q.sort === "newest" && q.decade == null ? todayIso : undefined,
  };
}

/** Human-readable heading for a filtered grid, e.g. "Top rated Tamil films". */
export function browseHeading(
  q: BrowseQuery,
  genreName: string | null,
): string {
  const noun = q.type === "movie" ? "films" : "series";
  const lang = INDIAN_LANGUAGES.find((l) => l.code === q.lang)?.label;
  const provider = IN_WATCH_PROVIDERS.find((p) => p.id === q.provider)?.label;
  const decade = DECADES.find((d) => d.start === q.decade)?.label;

  const prefix =
    q.sort === "rating" ? "Top rated" : q.sort === "newest" ? "Newest" : "Popular";

  const parts = [prefix, lang, genreName?.toLowerCase(), noun];
  let heading = parts.filter(Boolean).join(" ");
  if (decade) heading += ` from the ${decade}`;
  if (provider) heading += ` on ${provider}`;
  return heading;
}

// ─── Landing-page rails ────────────────────────────────────────────────────

export type RailConfig = {
  key: string;
  label: string;
  type: TmdbMediaType;
  params: DiscoverParams;
  /** Where "See all" goes — the same axis, as a full grid. */
  seeAll: BrowseQuery;
};

function railQuery(q: Omit<Partial<BrowseQuery>, "type"> & { type: TmdbMediaType }): BrowseQuery {
  return {
    genre: null,
    lang: null,
    provider: null,
    decade: null,
    sort: "popular",
    page: 1,
    ...q,
  };
}

/**
 * The landing overview: one rail per axis, each opening into a grid.
 *
 * Cost is deliberate and bounded (`OPTIMIZATIONS.md` — "rows are cheap
 * individually and expensive in aggregate"). Every rail is **page 1 only**, all
 * of them stream in parallel behind their own Suspense boundary, and the 6h
 * `revalidate` in `discoverTitles` means one fetch serves every visitor for the
 * window. Adding a rail here costs one shared TMDB call per 6h — but it also
 * costs vertical space, which is the scarcer resource. Prefer a chip in the
 * "Browse by" row over a new rail.
 *
 * There is exactly one provider rail and it is Netflix, because TMDB reports it
 * as `display_priorities.IN: 0` — the pick is from the data, not a favourite.
 */
export const DISCOVER_RAILS: RailConfig[] = [
  {
    key: "top-films",
    label: "Highest rated films",
    type: "movie",
    params: { sort: "rating", minVotes: RATING_FLOOR.broad.movie },
    seeAll: railQuery({ type: "movie", sort: "rating" }),
  },
  {
    key: "hindi",
    label: "Best of Hindi cinema",
    type: "movie",
    params: {
      sort: "rating",
      originalLanguages: ["hi"],
      minVotes: LANGUAGE_RATING_FLOOR.hi,
    },
    seeAll: railQuery({ type: "movie", sort: "rating", lang: "hi" }),
  },
  {
    key: "south",
    label: "Best of South Indian cinema",
    type: "movie",
    params: {
      sort: "rating",
      // The rail pools four industries, so it can carry a higher floor than any
      // of them alone — 25 is what Telugu, Malayalam and Bengali each support.
      originalLanguages: SOUTH_INDIAN_LANGUAGES,
      minVotes: 25,
    },
    // No single-language grid covers four languages, so "See all" opens Tamil —
    // the largest of the four — with the language chips one tap away.
    seeAll: railQuery({ type: "movie", sort: "rating", lang: "ta" }),
  },
  {
    key: "top-series",
    label: "Highest rated series",
    type: "tv",
    params: { sort: "rating", minVotes: RATING_FLOOR.broad.tv },
    seeAll: railQuery({ type: "tv", sort: "rating" }),
  },
  {
    key: "netflix",
    label: "Popular on Netflix in India",
    type: "movie",
    params: {
      sort: "popular",
      watchProviders: [8],
      watchRegion: WATCH_REGION,
      minVotes: POPULAR_FLOOR,
    },
    seeAll: railQuery({ type: "movie", provider: 8 }),
  },
];
