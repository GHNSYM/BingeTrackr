import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

// ─── Library ───────────────────────────────────────────────────────────────

export type LibraryPosterItem = {
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbId: string | null;
  tmdbType: "movie" | "tv";
  releaseYear: number | null;
  /** Small subtitle for the poster card — e.g. "Watched · 3 days ago". */
  meta?: string | null;
  /** Optional user rating (1-10). */
  rating?: number | null;
};

export type LibraryCounts = {
  watching: number;
  watched: number;
  watchlist: number;
  dropped: number;
};

/**
 * Media ids the user has finished — watched movies plus completed shows.
 *
 * "Watched" and "watchlist" are mutually exclusive: finishing something drops
 * it from the watchlist (see dropFromWatchlist in actions.ts). This is the
 * read-side half of that rule, so rows written before the rule existed — a
 * completed show still sitting in the watchlist — don't leak into the UI.
 * Scoped to a candidate set so it stays a bounded query.
 */
async function getFinishedMediaIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();

  const [watchedMovies, completedShows] = await Promise.all([
    supabase
      .from("watched_entries")
      .select("media_id")
      .eq("user_id", userId)
      .in("media_id", candidateIds)
      .is("episode_id", null),
    supabase
      .from("show_progress")
      .select("media_id")
      .eq("user_id", userId)
      .in("media_id", candidateIds)
      .eq("status", "completed"),
  ]);

  const finished = new Set<string>();
  for (const r of [
    ...(watchedMovies.data ?? []),
    ...(completedShows.data ?? []),
  ]) {
    finished.add(r.media_id as string);
  }
  return finished;
}

/**
 * Counts for the tab badges. Four queries for four numbers.
 *
 * This used to be seven: three separate `head: true` counts against
 * `show_progress` (watching / completed / dropped), plus the two inside
 * `getFinishedMediaIds`. PostgREST rejects aggregate selects on this project
 * ("Use of aggregate functions is not allowed" — verified against the live
 * API), so `GROUP BY status` isn't available over REST. Instead we read the
 * status column once and tally in JS: `show_progress` is one row per (user,
 * show), so it's inherently small, and two tiny columns cost far less than
 * three extra round-trips.
 *
 * That read also *is* the set of completed shows, which is half of what
 * `getFinishedMediaIds` computes — so the watchlist exclusion only needs the
 * watched-movies half, saving another query.
 *
 * Both list reads are paginated. They're per-user and bounded in practice, but
 * "how many shows can someone track" has no ceiling, and a silent truncation at
 * 1000 here would under-report a badge rather than fail loudly.
 */
export async function getLibraryCounts(): Promise<LibraryCounts> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const empty = { watching: 0, watched: 0, watchlist: 0, dropped: 0 };
  if (!user) return empty;

  type ProgressRow = { media_id: string; status: string };
  type IdRow = { media_id: string };

  const [progressRows, watchedMoviesRes, watchlistRows] = await Promise.all([
    fetchAllRows<ProgressRow>((from, to) =>
      supabase
        .from("show_progress")
        .select("media_id, status")
        .eq("user_id", user.id)
        .order("media_id", { ascending: true })
        .range(from, to)
        .overrideTypes<ProgressRow[]>(),
    ),
    supabase
      .from("watched_entries")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("episode_id", null),
    fetchAllRows<IdRow>((from, to) =>
      supabase
        .from("watchlist_entries")
        .select("media_id")
        .eq("user_id", user.id)
        .order("media_id", { ascending: true })
        .range(from, to)
        .overrideTypes<IdRow[]>(),
    ),
  ]);

  let watching = 0;
  let dropped = 0;
  let completedShows = 0;
  const completedIds = new Set<string>();
  for (const r of progressRows) {
    if (r.status === "watching") watching++;
    else if (r.status === "dropped") dropped++;
    else if (r.status === "completed") {
      completedShows++;
      completedIds.add(r.media_id);
    }
  }

  // Anything finished isn't "to watch" any more. Completed shows we already
  // know; only the watched-movies half needs a query, scoped to the candidates.
  const watchlistIds = watchlistRows.map((r) => r.media_id);
  let watchedMovieIds = new Set<string>();
  if (watchlistIds.length > 0) {
    const { data } = await supabase
      .from("watched_entries")
      .select("media_id")
      .eq("user_id", user.id)
      .in("media_id", watchlistIds)
      .is("episode_id", null);
    watchedMovieIds = new Set((data ?? []).map((r) => r.media_id as string));
  }

  return {
    watching,
    watched: (watchedMoviesRes.count ?? 0) + completedShows,
    watchlist: watchlistIds.filter(
      (id) => !completedIds.has(id) && !watchedMovieIds.has(id),
    ).length,
    dropped,
  };
}

/**
 * "Watched" = movies you marked + shows you set to Completed. Deduped by
 * media_id (in case a movie was marked multiple times as a rewatch).
 * Sorted by most recent.
 */
export async function getWatchedItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  type MediaJoin = {
    id: string;
    title: string;
    poster_path: string | null;
    type: "movie" | "tv";
    release_year: number | null;
    tmdb_id: string | null;
  };
  type MovieRow = { media_id: string; watched_at: string; media: MediaJoin | null };
  type ShowRow = {
    media_id: string;
    status_changed_at: string;
    media: MediaJoin | null;
  };

  const [movies, shows] = await Promise.all([
    fetchAllRows<MovieRow>((from, to) =>
      supabase
        .from("watched_entries")
        .select(
          `media_id, watched_at,
           media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
        )
        .eq("user_id", user.id)
        .is("episode_id", null)
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<MovieRow[]>(),
    ),
    fetchAllRows<ShowRow>((from, to) =>
      supabase
        .from("show_progress")
        .select(
          `media_id, status_changed_at,
           media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
        )
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("media_id", { ascending: true })
        .range(from, to)
        .overrideTypes<ShowRow[]>(),
    ),
  ]);

  type Row = { media_id: string; when: string; media: MediaJoin };

  const rows: Row[] = [
    ...movies
      .filter((r) => r.media)
      .map((r) => ({
        media_id: r.media_id,
        when: r.watched_at,
        media: r.media as MediaJoin,
      })),
    ...shows
      .filter((r) => r.media)
      .map((r) => ({
        media_id: r.media_id,
        when: r.status_changed_at,
        media: r.media as MediaJoin,
      })),
  ];

  // Dedupe by media_id — keep the most recent.
  const bestByMedia = new Map<string, Row>();
  for (const r of rows) {
    const prev = bestByMedia.get(r.media_id);
    if (!prev || new Date(r.when).getTime() > new Date(prev.when).getTime()) {
      bestByMedia.set(r.media_id, r);
    }
  }

  const deduped = [...bestByMedia.values()].sort(
    (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime(),
  );

  return deduped.map((r) => ({
    mediaId: r.media_id,
    title: r.media.title,
    posterPath: r.media.poster_path,
    tmdbId: r.media.tmdb_id,
    tmdbType: r.media.type,
    releaseYear: r.media.release_year,
    meta: relativeWhen(r.when),
  }));
}

export async function getWatchlistItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("watchlist_entries")
    .select(
      `media_id, added_at, priority,
       media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
    )
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("added_at", { ascending: false });

  if (!rows) return [];

  // Anything already finished isn't "to watch" any more. New writes are pruned
  // at write time; this covers entries that predate the rule.
  const finished = await getFinishedMediaIds(
    supabase,
    user.id,
    rows.map((r) => r.media_id as string),
  );
  const data = rows.filter((r) => !finished.has(r.media_id as string));
  if (data.length === 0) return [];

  return data.map((r) => {
    const m = r.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      release_year: number | null;
      tmdb_id: string | null;
    };
    return {
      mediaId: r.media_id as string,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: m.tmdb_id,
      tmdbType: m.type,
      releaseYear: m.release_year,
      meta: relativeWhen(r.added_at as string, "Added"),
    };
  });
}

export async function getDroppedItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  const { data } = await supabase
    .from("show_progress")
    .select(
      `media_id, status_changed_at,
       media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
    )
    .eq("user_id", user.id)
    .eq("status", "dropped")
    .order("status_changed_at", { ascending: false });

  if (!data) return [];

  return data.map((r) => {
    const m = r.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      release_year: number | null;
      tmdb_id: string | null;
    };
    return {
      mediaId: r.media_id as string,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: m.tmdb_id,
      tmdbType: m.type,
      releaseYear: m.release_year,
      meta: relativeWhen(r.status_changed_at as string, "Dropped"),
    };
  });
}

// ─── Home: "your stuff" sections ───────────────────────────────────────────

export type MonthActivity = {
  episodes: number;
  movies: number;
  minutes: number;
};

/**
 * Episode/movie counts and minutes watched in the current calendar month.
 *
 * Scoped to one month on purpose: this runs on Home, the most-visited route, so
 * it must not degrade into the full-table read that getStats does. A month of
 * normal activity is tens of rows.
 *
 * Still paginated, because "a month" is unbounded in principle — and in the dev
 * data every entry happens to fall inside the current month, which tripped the
 * 1000-row cap immediately.
 *
 * Only `runtime_minutes` and `episode_id` are selected, so even a heavy month
 * moves very little over the wire. The eventual fix is a SUM/COUNT RPC — see
 * OPTIMIZATIONS.md #4.
 */
export async function getMonthActivity(): Promise<MonthActivity> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const empty = { episodes: 0, movies: 0, minutes: 0 };
  if (!user) return empty;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  type Row = { runtime_minutes: number | null; episode_id: string | null };
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from("watched_entries")
      .select("runtime_minutes, episode_id")
      .eq("user_id", user.id)
      .gte("watched_at", monthStart)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<Row[]>(),
  );

  let episodes = 0;
  let movies = 0;
  let minutes = 0;
  for (const r of rows) {
    minutes += r.runtime_minutes ?? 0;
    if (r.episode_id === null) movies++;
    else episodes++;
  }
  return { episodes, movies, minutes };
}

export type OnThisDayItem = {
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbId: string | null;
  tmdbType: "movie" | "tv";
  yearsAgo: number;
  meta: string;
};

/**
 * What you watched on this calendar day in previous years.
 *
 * One RPC call. Previously this ORed together one single-day range per prior
 * year, because PostgREST can't filter on `EXTRACT(MONTH FROM ...)` — a real
 * constraint that produced a real hack. In SQL it's just a predicate, and the
 * de-dupe to one row per title is a window function rather than a JS loop over
 * every matching row.
 *
 * The `yearsBack` parameter is gone: it existed only to bound the number of OR
 * clauses. The RPC compares years directly, so all history is covered.
 *
 * Returns empty until an account has a year of history — expected, not a bug.
 */
export async function getOnThisDay(limit = 12): Promise<OnThisDayItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  type Row = {
    media_id: string;
    title: string;
    poster_path: string | null;
    tmdb_id: string | null;
    media_type: "movie" | "tv";
    watched_at: string;
    years_ago: number;
    is_episode: boolean;
  };

  const { data, error } = await supabase.rpc("get_on_this_day", {
    p_user_id: user.id,
    p_limit: limit,
  });

  if (error || !data) return [];

  return (data as Row[]).map((r) => ({
    mediaId: r.media_id,
    title: r.title,
    posterPath: r.poster_path,
    tmdbId: r.tmdb_id,
    tmdbType: r.media_type,
    yearsAgo: r.years_ago,
    meta: r.years_ago === 1 ? "1 year ago" : `${r.years_ago} years ago`,
  }));
}

export type RecentlyWatchedItem = {
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbId: string | null;
  tmdbType: "movie" | "tv";
  meta: string;
};

/**
 * Most recent activity, one entry per title.
 *
 * NOT derived from `watched_entries` ordered by date. Marking a season writes
 * hundreds of rows sharing one `watched_at`, so any "fetch N and dedupe"
 * approach collapses: measured against real data, 60 rows yielded just 4
 * distinct titles, and a 177-episode show is 177 rows for one title.
 *
 * Instead: `show_progress` is already one row per show and its
 * `status_changed_at` is bumped by every mark, so it IS the per-show
 * last-activity timestamp — deduped by construction. Movies come from
 * `watched_entries` where `episode_id IS NULL`. Two bounded, LIMIT-ed queries,
 * merged by timestamp.
 */
export async function getRecentlyWatched(
  limit = 12,
): Promise<RecentlyWatchedItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  type MediaJoin = {
    title: string;
    poster_path: string | null;
    type: "movie" | "tv";
    tmdb_id: string | null;
  };

  const [showsRes, moviesRes] = await Promise.all([
    supabase
      .from("show_progress")
      .select(
        `media_id, status_changed_at, current_season, current_episode,
         media:media_id ( id, title, poster_path, type, tmdb_id )`,
      )
      .eq("user_id", user.id)
      .order("status_changed_at", { ascending: false })
      .limit(limit),
    supabase
      .from("watched_entries")
      .select(
        `media_id, watched_at,
         media:media_id ( id, title, poster_path, type, tmdb_id )`,
      )
      .eq("user_id", user.id)
      .is("episode_id", null)
      .order("watched_at", { ascending: false })
      .limit(limit),
  ]);

  type Merged = {
    mediaId: string;
    when: string;
    media: MediaJoin;
    episodeLabel: string | null;
  };
  const merged: Merged[] = [];

  for (const row of showsRes.data ?? []) {
    const media = row.media as unknown as MediaJoin | null;
    if (!media) continue;
    const season = row.current_season as number | null;
    const episode = row.current_episode as number | null;
    merged.push({
      mediaId: row.media_id as string,
      when: row.status_changed_at as string,
      media,
      episodeLabel: season && episode ? `S${season} E${episode}` : null,
    });
  }
  for (const row of moviesRes.data ?? []) {
    const media = row.media as unknown as MediaJoin | null;
    if (!media) continue;
    merged.push({
      mediaId: row.media_id as string,
      when: row.watched_at as string,
      media,
      episodeLabel: null,
    });
  }

  // Dedupe defensively — a title shouldn't appear in both, but don't rely on it.
  const seen = new Set<string>();
  const picked = merged
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .filter((r) => {
      if (seen.has(r.mediaId)) return false;
      seen.add(r.mediaId);
      return true;
    })
    .slice(0, limit);

  if (picked.length === 0) return [];

  return picked.map((r) => {
    const when = bareRelative(r.when);
    return {
      mediaId: r.mediaId,
      title: r.media.title,
      posterPath: r.media.poster_path,
      tmdbId: r.media.tmdb_id,
      tmdbType: r.media.type,
      meta: r.episodeLabel ? `${r.episodeLabel} · ${when}` : when,
    };
  });
}

// ─── Poster quick-action state ─────────────────────────────────────────────

export type QuickTrackState = { watched: boolean; watchlisted: boolean };

/**
 * Tracking state for a batch of TMDB titles, so poster grids can render their
 * hover buttons already in the right state instead of guessing "not tracked".
 *
 * Four bounded queries regardless of how many posters are on screen. Keys are
 * `${type}-${tmdbId}` because TMDB numbers movies and shows in separate
 * namespaces — id 550 can be both.
 */
export async function getQuickTrackStates(
  targets: { tmdbId: number | string; tmdbType: "movie" | "tv" }[],
): Promise<Map<string, QuickTrackState>> {
  const states = new Map<string, QuickTrackState>();
  if (targets.length === 0) return states;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return states;

  const externalIds = [...new Set(targets.map((t) => String(t.tmdbId)))];

  // `media_type` lives on this table now (it's part of the PK), so the key can
  // be built without joining `media` at all.
  const { data: extRows } = await supabase
    .from("media_external_ids")
    .select("external_id, media_id, media_type")
    .eq("source", "tmdb")
    .in("external_id", externalIds);

  if (!extRows || extRows.length === 0) return states;

  // media_id → `${type}-${tmdbId}` key.
  const keyByMediaId = new Map<string, string>();
  for (const row of extRows) {
    keyByMediaId.set(
      row.media_id as string,
      `${row.media_type as string}-${row.external_id as string}`,
    );
  }
  const mediaIds = [...keyByMediaId.keys()];
  if (mediaIds.length === 0) return states;

  const [watchedMovies, completedShows, watchlisted] = await Promise.all([
    supabase
      .from("watched_entries")
      .select("media_id")
      .eq("user_id", user.id)
      .in("media_id", mediaIds)
      .is("episode_id", null),
    supabase
      .from("show_progress")
      .select("media_id")
      .eq("user_id", user.id)
      .in("media_id", mediaIds)
      .eq("status", "completed"),
    supabase
      .from("watchlist_entries")
      .select("media_id")
      .eq("user_id", user.id)
      .in("media_id", mediaIds),
  ]);

  const ensure = (mediaId: string): QuickTrackState | null => {
    const key = keyByMediaId.get(mediaId);
    if (!key) return null;
    let state = states.get(key);
    if (!state) {
      state = { watched: false, watchlisted: false };
      states.set(key, state);
    }
    return state;
  };

  for (const r of [
    ...(watchedMovies.data ?? []),
    ...(completedShows.data ?? []),
  ]) {
    const state = ensure(r.media_id as string);
    if (state) state.watched = true;
  }
  for (const r of watchlisted.data ?? []) {
    const state = ensure(r.media_id as string);
    if (state) state.watchlisted = true;
  }

  return states;
}

export function quickTrackKey(
  tmdbType: "movie" | "tv",
  tmdbId: number | string,
): string {
  return `${tmdbType}-${tmdbId}`;
}

// ─── Internal ──────────────────────────────────────────────────────────────

// `getTmdbIdMap` lived here: a second round-trip on every poster grid to map
// internal ids back to TMDB ids. `media.tmdb_id` is now a trigger-maintained
// cache column, so the id comes back on the media join the caller already does.
// Don't reintroduce it — add `tmdb_id` to the join instead.

/** Just the elapsed part — "today", "3d ago", "2mo ago". */
function bareRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, Date.now() - then);
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function relativeWhen(iso: string, prefix = "Watched"): string {
  return `${prefix} · ${bareRelative(iso)}`;
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export type Stats = {
  lifetime: {
    totalMinutes: number;
    moviesWatched: number;
    episodesWatched: number;
    showsCompleted: number;
  };
  thisYear: {
    year: number;
    totalMinutes: number;
    movies: number;
    episodes: number;
  };
  byType: { movie: number; tv: number };
  topShows: Array<{
    mediaId: string;
    title: string;
    posterPath: string | null;
    tmdbId: string | null;
    episodeCount: number;
    minutes: number;
  }>;
  onThisDay: Array<{
    mediaId: string;
    title: string;
    posterPath: string | null;
    tmdbId: string | null;
    tmdbType: "movie" | "tv";
    watchedAt: string;
    yearsAgo: number;
    isEpisode: boolean;
  }>;
};

/**
 * Everything the /stats page needs, via three aggregate RPCs.
 *
 * This used to read EVERY watched entry with a media join and aggregate in JS:
 * `ceil(n / 1000)` paginated requests and the whole table over the wire, just to
 * produce a dozen numbers. Correct, but egress grew linearly with history — at
 * 20k entries that was 20 requests and megabytes per stats view.
 *
 * `get_stats_totals` and `get_stats_top_shows` do the SUM/COUNT in Postgres, and
 * `get_on_this_day` replaces what used to be a second, redundant implementation
 * of the same idea inside this function (see DESIGN_ROADMAP.md). It is now the
 * single on-this-day query, shared with the Home rail.
 *
 * Optionally scoped to a specific user id (for public profiles). If omitted,
 * uses the current auth session. The RPCs are `security invoker`, so RLS still
 * enforces that a caller can only read another user's aggregates if that user's
 * profile is_public = true.
 */
export async function getStats(overrideUserId?: string): Promise<Stats> {
  const supabase = await createClient();
  let targetUserId = overrideUserId;
  if (!targetUserId) {
    targetUserId = (await getCurrentUser())?.id;
  }

  const currentYear = new Date().getFullYear();
  const empty: Stats = {
    lifetime: {
      totalMinutes: 0,
      moviesWatched: 0,
      episodesWatched: 0,
      showsCompleted: 0,
    },
    thisYear: {
      year: currentYear,
      totalMinutes: 0,
      movies: 0,
      episodes: 0,
    },
    byType: { movie: 0, tv: 0 },
    topShows: [],
    onThisDay: [],
  };
  if (!targetUserId) return empty;

  type TotalsRow = {
    total_minutes: number | string;
    movies_watched: number | string;
    episodes_watched: number | string;
    shows_completed: number | string;
    year_minutes: number | string;
    year_movies: number | string;
    year_episodes: number | string;
    movie_minutes: number | string;
    tv_minutes: number | string;
  };
  type TopShowRow = {
    media_id: string;
    title: string;
    poster_path: string | null;
    tmdb_id: string | null;
    episode_count: number | string;
    minutes: number | string;
  };
  type OnThisDayRow = {
    media_id: string;
    title: string;
    poster_path: string | null;
    tmdb_id: string | null;
    media_type: "movie" | "tv";
    watched_at: string;
    years_ago: number;
    is_episode: boolean;
  };

  const [totalsRes, topShowsRes, onThisDayRes] = await Promise.all([
    supabase.rpc("get_stats_totals", { p_user_id: targetUserId }),
    supabase.rpc("get_stats_top_shows", { p_user_id: targetUserId, p_limit: 5 }),
    supabase.rpc("get_on_this_day", { p_user_id: targetUserId, p_limit: 10 }),
  ]);

  // Every aggregate is bigint server-side and PostgREST may serialise bigint as
  // a string, so coerce rather than trusting the wire type.
  const n = (v: number | string | null | undefined) => Number(v ?? 0);

  const topShows = ((topShowsRes.data as TopShowRow[] | null) ?? []).map((r) => ({
    mediaId: r.media_id,
    title: r.title,
    posterPath: r.poster_path,
    tmdbId: r.tmdb_id,
    episodeCount: n(r.episode_count),
    minutes: n(r.minutes),
  }));
  const onThisDay = ((onThisDayRes.data as OnThisDayRow[] | null) ?? []).map(
    (r) => ({
      mediaId: r.media_id,
      title: r.title,
      posterPath: r.poster_path,
      tmdbId: r.tmdb_id,
      tmdbType: r.media_type,
      watchedAt: r.watched_at,
      yearsAgo: r.years_ago,
      isEpisode: r.is_episode,
    }),
  );

  // An account with no watched entries yields no totals row at all — that is
  // the zero case, not an error.
  const t = (totalsRes.data as TotalsRow[] | null)?.[0];
  if (!t) return { ...empty, topShows, onThisDay };

  return {
    lifetime: {
      totalMinutes: n(t.total_minutes),
      moviesWatched: n(t.movies_watched),
      episodesWatched: n(t.episodes_watched),
      showsCompleted: n(t.shows_completed),
    },
    thisYear: {
      year: currentYear,
      totalMinutes: n(t.year_minutes),
      movies: n(t.year_movies),
      episodes: n(t.year_episodes),
    },
    byType: { movie: n(t.movie_minutes), tv: n(t.tv_minutes) },
    topShows,
    onThisDay,
  };
}

// ─── Tier board ────────────────────────────────────────────────────────────

export type TierKey = "S" | "A" | "B" | "C" | "D";

export type TierBoardItem = {
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbId: string | null;
  tmdbType: "movie" | "tv";
  releaseYear: number | null;
  /** null → in the unranked tray. */
  tier: TierKey | null;
};

export type TierBoardData = {
  items: TierBoardItem[];
  labels: Record<TierKey, string>;
};

/**
 * All the data the /tiers page needs. Unranked pool = user's watched movies
 * plus every show they've made progress on, minus anything already on the
 * board. One flat items[] list on the client (each with an optional tier)
 * is simpler than two arrays for drag-source vs drop-target logic.
 */
export async function getTierBoard(): Promise<TierBoardData> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const empty: TierBoardData = {
    items: [],
    labels: { S: "S", A: "A", B: "B", C: "C", D: "D" },
  };
  if (!user) return empty;

  const [assignmentsRes, labelsRes, watchedMovies, progressRows] =
    await Promise.all([
      supabase
        .from("tier_assignments")
        .select(
          `media_id, tier,
           media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
        )
        .eq("user_id", user.id),
      supabase
        .from("tier_labels")
        .select("s_label, a_label, b_label, c_label, d_label")
        .eq("user_id", user.id)
        .maybeSingle(),
      fetchAllRows<{ media_id: string; media: unknown }>((from, to) =>
        supabase
          .from("watched_entries")
          .select(
            `media_id,
             media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
          )
          .eq("user_id", user.id)
          .is("episode_id", null)
          .order("id", { ascending: true })
          .range(from, to)
          .overrideTypes<{ media_id: string; media: unknown }[]>(),
      ),
      fetchAllRows<{ media_id: string; media: unknown }>((from, to) =>
        supabase
          .from("show_progress")
          .select(
            `media_id,
             media:media_id ( id, title, poster_path, type, release_year, tmdb_id )`,
          )
          .eq("user_id", user.id)
          .order("media_id", { ascending: true })
          .range(from, to)
          .overrideTypes<{ media_id: string; media: unknown }[]>(),
      ),
    ]);

  type MediaRow = {
    id: string;
    title: string;
    poster_path: string | null;
    type: "movie" | "tv";
    release_year: number | null;
    tmdb_id: string | null;
  };

  const assignedIds = new Set<string>();
  const items: TierBoardItem[] = [];

  // Assigned first so their order is stable.
  for (const row of assignmentsRes.data ?? []) {
    const m = row.media as unknown as MediaRow | null;
    if (!m) continue;
    assignedIds.add(row.media_id as string);
    items.push({
      mediaId: row.media_id as string,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: m.tmdb_id,
      tmdbType: m.type,
      releaseYear: m.release_year,
      tier: row.tier as TierKey,
    });
  }

  // Unranked pool — dedup by media_id, excluding already-assigned.
  const seen = new Set<string>(assignedIds);
  const unrankedCandidates = [
    ...watchedMovies,
    ...progressRows,
  ];
  for (const row of unrankedCandidates) {
    const id = row.media_id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = row.media as unknown as MediaRow | null;
    if (!m) continue;
    items.push({
      mediaId: id,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: m.tmdb_id,
      tmdbType: m.type,
      releaseYear: m.release_year,
      tier: null,
    });
  }

  const l = labelsRes.data;
  const labels: Record<TierKey, string> = {
    S: (l?.s_label as string | undefined) ?? "S",
    A: (l?.a_label as string | undefined) ?? "A",
    B: (l?.b_label as string | undefined) ?? "B",
    C: (l?.c_label as string | undefined) ?? "C",
    D: (l?.d_label as string | undefined) ?? "D",
  };

  return { items, labels };
}

// ─── Public profile helpers ────────────────────────────────────────────────

export async function getProfileByUsername(
  username: string,
): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle<Profile>();
  // RLS returns null if the profile is private and viewer isn't the owner.
  return data;
}

export type PublicProfileCounts = {
  shows: number;
  episodes: number;
  hours: number;
  lists: number;
};

/**
 * Compact numbers for the public profile header row. One RPC.
 *
 * The hours figure used to be a JS-side sum over a paginated read of every
 * watched entry — four queries plus the whole runtime column over the wire for
 * one number. `get_profile_counts` does all four counts server-side; the
 * integer division for hours matches the old `Math.floor(minutes / 60)`.
 */
export async function getPublicProfileCounts(
  userId: string,
): Promise<PublicProfileCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profile_counts", {
    p_user_id: userId,
  });

  type Row = {
    shows: number | string;
    episodes: number | string;
    hours: number | string;
    lists: number | string;
  };
  const row = (data as Row[] | null)?.[0];
  if (error || !row) return { shows: 0, episodes: 0, hours: 0, lists: 0 };

  const n = (v: number | string | null | undefined) => Number(v ?? 0);
  return {
    shows: n(row.shows),
    episodes: n(row.episodes),
    hours: n(row.hours),
    lists: n(row.lists),
  };
}

export type ActivityItem = {
  /** Most recent watch in the group. */
  watchedAt: string;
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbType: "movie" | "tv";
  tmdbId: string | null;
  /** null for a movie. */
  episodes: {
    count: number;
    firstSeason: number;
    firstEpisode: number;
    lastSeason: number;
    lastEpisode: number;
    /** True when the group covers one season with no gaps — "E1–E6" is honest. */
    contiguous: boolean;
    /** Episode name, only when the group is a single episode. */
    singleName: string | null;
  } | null;
};

/**
 * Recent activity for a public profile, **grouped into one row per show**.
 *
 * One row per `watched_entries` row is unusable: marking a season writes
 * hundreds of rows sharing a single `watched_at`, so a 12-row feed showed 12
 * episodes of one show and nothing else. Same failure that shaped
 * `getRecentlyWatched` — see its comment.
 *
 * Consecutive entries for the same title collapse into a group, which the UI
 * renders as "S1 · E1–E6". Grouping is by *adjacency*, not by title overall:
 * watching show A, then B, then A again is genuinely three entries in a
 * timeline, and flattening that would misrepresent the history.
 *
 * COST: reads a bounded window of raw rows and groups in JS, because PostgREST
 * has aggregates disabled on this project (verified) and can't `DISTINCT` — so
 * "the last N shows" isn't expressible over REST. The window is capped at one
 * request's worth. A single enormous binge can therefore yield fewer than
 * `limit` groups, which is a deliberate bound rather than an unbounded read; the
 * proper fix is an RPC with a gaps-and-islands window function, noted in
 * `OPTIMIZATIONS.md`.
 */
export async function getRecentActivity(
  userId: string,
  limit = 15,
): Promise<ActivityItem[]> {
  const supabase = await createClient();

  // Enough raw rows that a normal binge still leaves room for other titles,
  // while staying inside a single PostgREST response.
  const WINDOW = 400;

  const { data } = await supabase
    .from("watched_entries")
    .select(
      `watched_at, media_id, episode_id,
       media:media_id ( id, title, poster_path, type, tmdb_id ),
       episode:episode_id ( episode_number, name,
         seasons ( season_number ) )`,
    )
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .limit(WINDOW);

  if (!data) return [];

  type Row = {
    watched_at: string;
    media_id: string;
    episode_id: string | null;
    media: {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      tmdb_id: string | null;
    } | null;
    episode: {
      episode_number: number;
      name: string | null;
      seasons: { season_number: number } | null;
    } | null;
  };

  const groups: ActivityItem[] = [];
  // Accumulates the (season, episode) pairs of the group being built.
  let pending: { seasons: number[]; episodes: number[]; names: (string | null)[] } | null =
    null;
  let seenEpisodeIds = new Set<string>();

  const flush = () => {
    if (!pending || groups.length === 0) return;
    const target = groups[groups.length - 1];
    const { seasons, episodes, names } = pending;
    if (episodes.length > 0) {
      // Sort ascending so "first" and "last" are chronological in show order,
      // not in the order they happen to have been marked.
      const order = episodes
        .map((e, i) => ({ s: seasons[i], e }))
        .sort((a, b) => (a.s !== b.s ? a.s - b.s : a.e - b.e));
      const first = order[0];
      const last = order[order.length - 1];
      const singleSeason = first.s === last.s;
      const distinct = new Set(order.map((o) => `${o.s}-${o.e}`)).size;
      target.episodes = {
        count: distinct,
        firstSeason: first.s,
        firstEpisode: first.e,
        lastSeason: last.s,
        lastEpisode: last.e,
        contiguous:
          singleSeason && distinct === last.e - first.e + 1,
        singleName: distinct === 1 ? (names[0] ?? null) : null,
      };
    }
    pending = null;
  };

  for (const raw of data as unknown as Row[]) {
    const media = raw.media;
    if (!media) continue;

    const prev = groups[groups.length - 1];
    const isEpisode = raw.episode_id !== null;

    // Same title as the row before it → extend that group. Movies never merge:
    // two viewings of the same film are two events.
    const extend =
      prev !== undefined &&
      prev.mediaId === raw.media_id &&
      isEpisode &&
      prev.episodes !== null;

    if (extend) {
      if (raw.episode_id && seenEpisodeIds.has(raw.episode_id)) continue;
      if (raw.episode_id) seenEpisodeIds.add(raw.episode_id);
      pending!.seasons.push(raw.episode?.seasons?.season_number ?? 0);
      pending!.episodes.push(raw.episode?.episode_number ?? 0);
      pending!.names.push(raw.episode?.name ?? null);
      continue;
    }

    flush();
    if (groups.length >= limit) break;

    seenEpisodeIds = new Set(raw.episode_id ? [raw.episode_id] : []);
    groups.push({
      watchedAt: raw.watched_at,
      mediaId: raw.media_id,
      title: media.title,
      posterPath: media.poster_path,
      tmdbType: media.type,
      tmdbId: media.tmdb_id,
      // Placeholder that flush() fills in; a movie stays null.
      episodes: isEpisode
        ? {
            count: 1,
            firstSeason: 0,
            firstEpisode: 0,
            lastSeason: 0,
            lastEpisode: 0,
            contiguous: true,
            singleName: null,
          }
        : null,
    });
    if (isEpisode) {
      pending = {
        seasons: [raw.episode?.seasons?.season_number ?? 0],
        episodes: [raw.episode?.episode_number ?? 0],
        names: [raw.episode?.name ?? null],
      };
    }
  }
  flush();

  return groups.slice(0, limit);
}

export type PublicListSummary = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  itemCount: number;
  coverPosters: (string | null)[];
};

/**
 * Public custom lists for a user's profile page. Also fetches up to 4 cover
 * posters per list (rendered as a 2×2 mosaic in the UI).
 *
 * Two queries total, not two per list. The old shape was an N+1 — a count and a
 * poster fetch for every list — so a profile with 12 lists cost 25 round-trips.
 * Now the items for every list come back in one read scoped to those list ids,
 * and both the per-list count and the first four posters are derived from it.
 *
 * `count` therefore becomes a JS tally rather than a server-side `head: true`.
 * That's the trade: PostgREST won't do `GROUP BY list_id` (aggregates are
 * disabled on this project, verified against the live API), so a grouped count
 * would need an RPC. Reading the rows is the cheaper move at list sizes a human
 * curates — and it's paginated, so a big list degrades into extra requests
 * rather than a wrong number.
 */
export async function getPublicListsByUser(
  userId: string,
): Promise<PublicListSummary[]> {
  const supabase = await createClient();
  const { data: lists } = await supabase
    .from("custom_lists")
    .select("id, name, description, slug")
    .eq("user_id", userId)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id as string);

  type ItemRow = {
    list_id: string;
    position: number | null;
    media: { poster_path: string | null } | null;
  };
  const items = await fetchAllRows<ItemRow>((from, to) =>
    supabase
      .from("custom_list_items")
      .select(`list_id, position, media:media_id ( poster_path )`)
      .in("list_id", listIds)
      .order("list_id", { ascending: true })
      .order("position", { ascending: true })
      .range(from, to)
      .overrideTypes<ItemRow[]>(),
  );

  const countByList = new Map<string, number>();
  const postersByList = new Map<string, (string | null)[]>();
  for (const it of items) {
    countByList.set(it.list_id, (countByList.get(it.list_id) ?? 0) + 1);
    // Rows arrive ordered by position within each list, so the first four we
    // see are the four the mosaic wants.
    const posters = postersByList.get(it.list_id) ?? [];
    if (posters.length < 4) {
      posters.push(it.media?.poster_path ?? null);
      postersByList.set(it.list_id, posters);
    }
  }

  return lists.map((list) => {
    const listId = list.id as string;
    return {
      id: listId,
      name: list.name as string,
      description: list.description as string | null,
      slug: list.slug as string,
      itemCount: countByList.get(listId) ?? 0,
      coverPosters: postersByList.get(listId) ?? [],
    };
  });
}

export const BANNER_GRADIENTS: Record<string, string> = {
  aurora: "linear-gradient(120deg, #3a2b5f, #1f6f8b)",
  ember: "linear-gradient(120deg, #5a1d10, #c2452a)",
  forest: "linear-gradient(120deg, #14361f, #2f7d4f)",
  rose: "linear-gradient(120deg, #5a1438, #b03a6a)",
  gold: "linear-gradient(120deg, #3a2f10, #b8902a)",
  mono: "linear-gradient(120deg, #26262c, #101013)",
};

export function bannerGradient(theme: string | null | undefined): string {
  return BANNER_GRADIENTS[theme ?? "mono"] ?? BANNER_GRADIENTS.mono;
}

// ─── Continue Watching (existing) ──────────────────────────────────────────

export type ContinueWatchingItem = {
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbId: string | null;
  tmdbType: "tv";
  currentSeason: number | null;
  currentEpisode: number | null;
  totalEpisodes: number;
  totalWatched: number;
  next: {
    episodeId: string;
    seasonNumber: number;
    episodeNumber: number;
    name: string | null;
    runtimeMinutes: number | null;
  } | null;
};

/**
 * Everything the /home Continue Watching section needs, in ONE query.
 *
 * This was the last P1 item in `OPTIMIZATIONS.md`. It used to be one query per
 * show, each fetching *every* episode of that show, then finding the next
 * unwatched one in JS — measured at 5 queries / 171 episode rows / 32 KB to
 * extract 5 episodes. The Library "Watching" tab calls this with limit=50, so
 * the worst case was 50 queries and several thousand rows for one page view.
 *
 * `get_continue_watching` does the whole thing server-side with a lateral join,
 * keyed off a row-constructor comparison — `(season, episode) > (current_season,
 * current_episode)` is exactly the lexicographic "next episode" the JS
 * sort-then-find implemented. See the migration for why this is an RPC rather
 * than a denormalized `show_progress.next_episode_id`: the episode catalogue
 * changes independently of the user's marks, so a stored pointer would silently
 * strand a show on "all caught up" forever.
 *
 * The RPC filters on `auth.uid()` itself, so there's no user id to pass; it's
 * `security invoker`, so RLS applies exactly as it did to the queries above.
 */
export async function getContinueWatching(
  limit = 12,
): Promise<ContinueWatchingItem[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  type Row = {
    media_id: string;
    title: string;
    poster_path: string | null;
    tmdb_id: string | null;
    current_season: number | null;
    current_episode: number | null;
    total_episodes: number | null;
    total_watched: number | string | null;
    next_episode_id: string | null;
    next_season_number: number | null;
    next_episode_number: number | null;
    next_name: string | null;
    next_runtime_minutes: number | null;
  };

  const { data, error } = await supabase.rpc("get_continue_watching", {
    p_limit: limit,
  });

  if (error || !data) return [];

  return (data as Row[]).map((r) => ({
    mediaId: r.media_id,
    title: r.title,
    posterPath: r.poster_path,
    tmdbId: r.tmdb_id,
    tmdbType: "tv" as const,
    currentSeason: r.current_season,
    currentEpisode: r.current_episode,
    totalEpisodes: r.total_episodes ?? 0,
    // count(*) is bigint; PostgREST may hand it back as a string.
    totalWatched: Number(r.total_watched ?? 0),
    next: r.next_episode_id
      ? {
          episodeId: r.next_episode_id,
          seasonNumber: r.next_season_number ?? 0,
          episodeNumber: r.next_episode_number ?? 0,
          name: r.next_name,
          runtimeMinutes: r.next_runtime_minutes,
        }
      : null,
  }));
}
