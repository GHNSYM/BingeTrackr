import "server-only";
import {
  getCollection,
  getRecommendations,
  getSimilar,
  type TmdbMediaSearchResult,
  type TmdbMediaType,
  type TmdbMovieDetails,
  type TmdbSearchResult,
  type TmdbTvDetails,
} from "./client";

export type RecommendationSection = {
  /** Section heading, e.g. "More from The Fast and the Furious Collection". */
  label: string;
  items: TmdbMediaSearchResult[];
};

/** Roughly two rows at the default poster size. */
const SECTION_LIMIT = 12;

/**
 * Recommendations for a title page, franchise-first.
 *
 * Order of preference:
 *  1. Same universe — TMDB's `belongs_to_collection` gives us the actual
 *     franchise (all the Fast & Furious films), not a genre guess. Movies only;
 *     TMDB has no collection concept for TV.
 *  2. TMDB `/recommendations` — editorial + co-watch signal.
 *  3. TMDB `/similar` — genre and keyword overlap, used to top up (or replace)
 *     a thin recommendations list.
 *
 * Every call is best-effort: recommendations are a nice-to-have, so a TMDB
 * hiccup returns fewer sections rather than failing the page.
 */
export async function getTitleRecommendations(
  type: TmdbMediaType,
  tmdbId: number | string,
  details: TmdbMovieDetails | TmdbTvDetails,
): Promise<RecommendationSection[]> {
  const currentId = Number(tmdbId);
  const collectionRef =
    type === "movie"
      ? ((details as TmdbMovieDetails).belongs_to_collection ?? null)
      : null;

  const [collection, recommended, similar] = await Promise.all([
    collectionRef
      ? getCollection(collectionRef.id).catch(() => null)
      : Promise.resolve(null),
    getRecommendations(type, tmdbId).catch(() => null),
    getSimilar(type, tmdbId).catch(() => null),
  ]);

  const sections: RecommendationSection[] = [];
  // Anything already shown (or the title itself) is excluded from later
  // sections, so the same poster never appears twice on the page.
  const seen = new Set<number>([currentId]);

  const collectionParts = normalize(collection?.parts, type, seen);
  if (collectionParts.length > 0) {
    // Release order — a franchise reads as a sequence, not a ranking.
    collectionParts.sort((a, b) => releaseTime(a) - releaseTime(b));
    const shown = collectionParts.slice(0, SECTION_LIMIT);
    sections.push({
      label: `More from ${collection?.name ?? "this collection"}`,
      items: shown,
    });
    // Only what we actually rendered — a part cut off by the limit is still
    // fair game for the section below.
    for (const item of shown) seen.add(item.id);
  }

  // `seen` has to grow between these two calls, or a title that appears in
  // BOTH /recommendations and /similar renders twice.
  const fromRecommendations = normalize(recommended?.results, type, seen);
  for (const item of fromRecommendations) seen.add(item.id);
  const fromSimilar = normalize(similar?.results, type, seen);

  const alsoLike = [...fromRecommendations, ...fromSimilar].slice(
    0,
    SECTION_LIMIT,
  );

  if (alsoLike.length > 0) {
    sections.push({
      label: type === "movie" ? "More like this" : "Similar shows",
      items: alsoLike,
    });
  }

  return sections;
}

/**
 * `/recommendations`, `/similar` and `/collection` all return bare movie or TV
 * objects with no `media_type`, so we stamp it on. Also drops posterless
 * entries — a wall of gradient fallbacks reads as broken in a recs row — and
 * de-dupes against everything already placed.
 */
function normalize(
  results: TmdbSearchResult[] | undefined,
  type: TmdbMediaType,
  seen: Set<number>,
): TmdbMediaSearchResult[] {
  if (!results) return [];
  const out: TmdbMediaSearchResult[] = [];
  const localSeen = new Set<number>();
  for (const r of results) {
    if (!r.poster_path) continue;
    if (seen.has(r.id) || localSeen.has(r.id)) continue;
    localSeen.add(r.id);
    out.push({ ...r, media_type: type });
  }
  return out;
}

function releaseTime(r: TmdbSearchResult): number {
  const date = r.release_date ?? r.first_air_date ?? "";
  const t = Date.parse(date);
  // Undated entries (announced-but-unscheduled sequels) sort last.
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
