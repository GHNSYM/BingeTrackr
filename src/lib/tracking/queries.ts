import "server-only";
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
 * Counts for the tab badges. Head-only counts where we can; the watchlist
 * count has to pull ids so it can exclude anything already finished (keeping
 * the badge honest against the filtered list).
 */
export async function getLibraryCounts(): Promise<LibraryCounts> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const empty = { watching: 0, watched: 0, watchlist: 0, dropped: 0 };
  if (!user) return empty;

  const [
    watchingRes,
    watchedMoviesRes,
    completedShowsRes,
    watchlistRes,
    droppedRes,
  ] = await Promise.all([
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "watching"),
    supabase
      .from("watched_entries")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("episode_id", null),
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("watchlist_entries")
      .select("media_id")
      .eq("user_id", user.id),
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "dropped"),
  ]);

  const watchlistIds = (watchlistRes.data ?? []).map(
    (r) => r.media_id as string,
  );
  const finished = await getFinishedMediaIds(supabase, user.id, watchlistIds);

  return {
    watching: watchingRes.count ?? 0,
    watched: (watchedMoviesRes.count ?? 0) + (completedShowsRes.count ?? 0),
    watchlist: watchlistIds.filter((id) => !finished.has(id)).length,
    dropped: droppedRes.count ?? 0,
  };
}

/**
 * "Watched" = movies you marked + shows you set to Completed. Deduped by
 * media_id (in case a movie was marked multiple times as a rewatch).
 * Sorted by most recent.
 */
export async function getWatchedItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  type MediaJoin = {
    id: string;
    title: string;
    poster_path: string | null;
    type: "movie" | "tv";
    release_year: number | null;
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
           media:media_id ( id, title, poster_path, type, release_year )`,
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
           media:media_id ( id, title, poster_path, type, release_year )`,
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

  const tmdbMap = await getTmdbIdMap(deduped.map((r) => r.media_id));

  return deduped.map((r) => ({
    mediaId: r.media_id,
    title: r.media.title,
    posterPath: r.media.poster_path,
    tmdbId: tmdbMap.get(r.media_id) ?? null,
    tmdbType: r.media.type,
    releaseYear: r.media.release_year,
    meta: relativeWhen(r.when),
  }));
}

export async function getWatchlistItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("watchlist_entries")
    .select(
      `media_id, added_at, priority,
       media:media_id ( id, title, poster_path, type, release_year )`,
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

  const tmdbMap = await getTmdbIdMap(data.map((r) => r.media_id as string));

  return data.map((r) => {
    const m = r.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      release_year: number | null;
    };
    return {
      mediaId: r.media_id as string,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: tmdbMap.get(r.media_id as string) ?? null,
      tmdbType: m.type,
      releaseYear: m.release_year,
      meta: relativeWhen(r.added_at as string, "Added"),
    };
  });
}

export async function getDroppedItems(): Promise<LibraryPosterItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("show_progress")
    .select(
      `media_id, status_changed_at,
       media:media_id ( id, title, poster_path, type, release_year )`,
    )
    .eq("user_id", user.id)
    .eq("status", "dropped")
    .order("status_changed_at", { ascending: false });

  if (!data) return [];
  const tmdbMap = await getTmdbIdMap(data.map((r) => r.media_id as string));

  return data.map((r) => {
    const m = r.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      release_year: number | null;
    };
    return {
      mediaId: r.media_id as string,
      title: m.title,
      posterPath: m.poster_path,
      tmdbId: tmdbMap.get(r.media_id as string) ?? null,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
 * PostgREST can't filter on `EXTRACT(MONTH FROM ...)`, so instead of scanning
 * everything and matching in JS (what getStats does), this ORs together one
 * single-day range per prior year. Bounded, one round-trip, and verified
 * against the live DB.
 *
 * Returns empty until an account has a year of history — expected, not a bug.
 */
export async function getOnThisDay(
  yearsBack = 10,
  limit = 12,
): Promise<OnThisDayItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  const currentYear = now.getFullYear();

  const clauses: string[] = [];
  for (let y = currentYear - 1; y >= currentYear - yearsBack; y--) {
    // `new Date(y, month, day + 1)` rolls month/year over correctly.
    const start = new Date(y, month, day).toISOString();
    const end = new Date(y, month, day + 1).toISOString();
    clauses.push(
      `and(watched_at.gte."${start}",watched_at.lt."${end}")`,
    );
  }

  const { data } = await supabase
    .from("watched_entries")
    .select(
      `watched_at, media_id, episode_id,
       media:media_id ( id, title, poster_path, type )`,
    )
    .eq("user_id", user.id)
    .or(clauses.join(","))
    .order("watched_at", { ascending: false });

  if (!data || data.length === 0) return [];

  // One entry per title — a binge shouldn't fill the rail with one show.
  type Row = {
    watched_at: string;
    media_id: string;
    media: {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
    } | null;
  };
  const seen = new Set<string>();
  const picked: Row[] = [];
  for (const row of data as unknown as Row[]) {
    if (!row.media || seen.has(row.media_id)) continue;
    seen.add(row.media_id);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  if (picked.length === 0) return [];

  const tmdbMap = await getTmdbIdMap(picked.map((r) => r.media_id));

  return picked.map((r) => {
    const yearsAgo = currentYear - new Date(r.watched_at).getFullYear();
    return {
      mediaId: r.media_id,
      title: r.media!.title,
      posterPath: r.media!.poster_path,
      tmdbId: tmdbMap.get(r.media_id) ?? null,
      tmdbType: r.media!.type,
      yearsAgo,
      meta: yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`,
    };
  });
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  type MediaJoin = {
    title: string;
    poster_path: string | null;
    type: "movie" | "tv";
  };

  const [showsRes, moviesRes] = await Promise.all([
    supabase
      .from("show_progress")
      .select(
        `media_id, status_changed_at, current_season, current_episode,
         media:media_id ( id, title, poster_path, type )`,
      )
      .eq("user_id", user.id)
      .order("status_changed_at", { ascending: false })
      .limit(limit),
    supabase
      .from("watched_entries")
      .select(
        `media_id, watched_at,
         media:media_id ( id, title, poster_path, type )`,
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

  const tmdbMap = await getTmdbIdMap(picked.map((r) => r.mediaId));

  return picked.map((r) => {
    const when = bareRelative(r.when);
    return {
      mediaId: r.mediaId,
      title: r.media.title,
      posterPath: r.media.poster_path,
      tmdbId: tmdbMap.get(r.mediaId) ?? null,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return states;

  const externalIds = [...new Set(targets.map((t) => String(t.tmdbId)))];

  const { data: extRows } = await supabase
    .from("media_external_ids")
    .select("external_id, media_id, media:media_id ( type )")
    .eq("source", "tmdb")
    .in("external_id", externalIds);

  if (!extRows || extRows.length === 0) return states;

  // media_id → `${type}-${tmdbId}` key.
  const keyByMediaId = new Map<string, string>();
  for (const row of extRows) {
    const media = row.media as unknown as { type: "movie" | "tv" } | null;
    if (!media) continue;
    keyByMediaId.set(
      row.media_id as string,
      `${media.type}-${row.external_id as string}`,
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

async function getTmdbIdMap(mediaIds: string[]): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_external_ids")
    .select("media_id, external_id")
    .eq("source", "tmdb")
    .in("media_id", mediaIds);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    map.set(r.media_id as string, r.external_id as string);
  }
  return map;
}

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
 * Everything the /stats page needs, in as few round-trips as we can
 * reasonably manage: one big fetch of watched_entries with the media join,
 * one count for shows-completed, then all aggregation in JS. Fine up to
 * tens of thousands of watched entries; if a user ever crosses that we
 * push some of this into a Postgres function.
 */
/**
 * Optionally scoped to a specific user id (for public profiles). If omitted,
 * uses the current auth session. RLS enforces that a caller can only read
 * another user's aggregates if that user's profile is_public = true.
 */
export async function getStats(overrideUserId?: string): Promise<Stats> {
  const supabase = await createClient();
  let targetUserId = overrideUserId;
  if (!targetUserId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    targetUserId = user?.id;
  }

  const empty: Stats = {
    lifetime: {
      totalMinutes: 0,
      moviesWatched: 0,
      episodesWatched: 0,
      showsCompleted: 0,
    },
    thisYear: {
      year: new Date().getFullYear(),
      totalMinutes: 0,
      movies: 0,
      episodes: 0,
    },
    byType: { movie: 0, tv: 0 },
    topShows: [],
    onThisDay: [],
  };
  if (!targetUserId) return empty;

  type StatsEntry = {
    watched_at: string;
    runtime_minutes: number | null;
    media_id: string;
    episode_id: string | null;
    media: { id: string; title: string; poster_path: string | null; type: "movie" | "tv" } | null;
  };

  const [entries, completedRes] = await Promise.all([
    // MUST paginate — an unbounded select silently stops at PostgREST's
    // 1000-row cap, which made every aggregate below wrong for any user past
    // that many watched entries.
    fetchAllRows<StatsEntry>((from, to) =>
      supabase
        .from("watched_entries")
        .select(
          `watched_at, runtime_minutes, media_id, episode_id,
           media:media_id ( id, title, poster_path, type )`,
        )
        .eq("user_id", targetUserId)
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<StatsEntry[]>(),
    ),
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("status", "completed"),
  ]);

  const showsCompleted = completedRes.count ?? 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  let lifetimeMinutes = 0;
  let moviesLifetime = 0;
  let episodesLifetime = 0;
  let thisYearMinutes = 0;
  let thisYearMovies = 0;
  let thisYearEpisodes = 0;
  const byType = { movie: 0, tv: 0 };

  const showAgg = new Map<
    string,
    {
      title: string;
      posterPath: string | null;
      epCount: number;
      minutes: number;
    }
  >();

  type OnThisDayRow = {
    mediaId: string;
    title: string;
    posterPath: string | null;
    tmdbType: "movie" | "tv";
    watchedAt: string;
    yearsAgo: number;
    isEpisode: boolean;
  };
  const onThisDay: OnThisDayRow[] = [];

  for (const e of entries) {
    const runtime = (e.runtime_minutes as number | null) ?? 0;
    const isEpisode = e.episode_id !== null;
    const media = e.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
    } | null;
    if (!media) continue;

    lifetimeMinutes += runtime;
    if (isEpisode) episodesLifetime++;
    else moviesLifetime++;

    const watched = new Date(e.watched_at as string);
    if (watched.getFullYear() === currentYear) {
      thisYearMinutes += runtime;
      if (isEpisode) thisYearEpisodes++;
      else thisYearMovies++;
    }

    if (media.type === "movie") byType.movie += runtime;
    else if (media.type === "tv") byType.tv += runtime;

    if (isEpisode) {
      const mid = e.media_id as string;
      const cur = showAgg.get(mid) ?? {
        title: media.title,
        posterPath: media.poster_path,
        epCount: 0,
        minutes: 0,
      };
      cur.epCount++;
      cur.minutes += runtime;
      showAgg.set(mid, cur);
    }

    if (
      watched.getMonth() === currentMonth &&
      watched.getDate() === currentDate &&
      watched.getFullYear() < currentYear
    ) {
      onThisDay.push({
        mediaId: e.media_id as string,
        title: media.title,
        posterPath: media.poster_path,
        tmdbType: media.type,
        watchedAt: e.watched_at as string,
        yearsAgo: currentYear - watched.getFullYear(),
        isEpisode,
      });
    }
  }

  const topShowsSorted = [...showAgg.entries()]
    .sort((a, b) => b[1].epCount - a[1].epCount)
    .slice(0, 5);

  const idsToResolve = new Set<string>();
  topShowsSorted.forEach(([id]) => idsToResolve.add(id));
  onThisDay.forEach((o) => idsToResolve.add(o.mediaId));
  const tmdbMap = await getTmdbIdMap([...idsToResolve]);

  return {
    lifetime: {
      totalMinutes: lifetimeMinutes,
      moviesWatched: moviesLifetime,
      episodesWatched: episodesLifetime,
      showsCompleted,
    },
    thisYear: {
      year: currentYear,
      totalMinutes: thisYearMinutes,
      movies: thisYearMovies,
      episodes: thisYearEpisodes,
    },
    byType,
    topShows: topShowsSorted.map(([mediaId, s]) => ({
      mediaId,
      title: s.title,
      posterPath: s.posterPath,
      tmdbId: tmdbMap.get(mediaId) ?? null,
      episodeCount: s.epCount,
      minutes: s.minutes,
    })),
    onThisDay: onThisDay
      .sort((a, b) => a.yearsAgo - b.yearsAgo)
      .slice(0, 10)
      .map((o) => ({ ...o, tmdbId: tmdbMap.get(o.mediaId) ?? null })),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
           media:media_id ( id, title, poster_path, type, release_year )`,
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
             media:media_id ( id, title, poster_path, type, release_year )`,
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
             media:media_id ( id, title, poster_path, type, release_year )`,
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
      tmdbId: null, // filled in after batched lookup below
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
      tmdbId: null,
      tmdbType: m.type,
      releaseYear: m.release_year,
      tier: null,
    });
  }

  // Fill tmdb ids in one batched lookup.
  const tmdbMap = await getTmdbIdMap(items.map((i) => i.mediaId));
  for (const item of items) {
    item.tmdbId = tmdbMap.get(item.mediaId) ?? null;
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
 * Compact numbers for the public profile header row.
 */
export async function getPublicProfileCounts(
  userId: string,
): Promise<PublicProfileCounts> {
  const supabase = await createClient();
  const [showsRes, episodesRes, runtimeRows, listsRes] = await Promise.all([
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("watched_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("episode_id", "is", null),
    // Paginated — the hours figure is a JS-side sum, so a truncated read
    // silently under-reports it.
    fetchAllRows<{ runtime_minutes: number | null }>((from, to) =>
      supabase
        .from("watched_entries")
        .select("runtime_minutes")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<{ runtime_minutes: number | null }[]>(),
    ),
    supabase
      .from("custom_lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_public", true),
  ]);

  const totalMinutes = runtimeRows.reduce(
    (sum, r) => sum + (r.runtime_minutes ?? 0),
    0,
  );

  return {
    shows: showsRes.count ?? 0,
    episodes: episodesRes.count ?? 0,
    hours: Math.floor(totalMinutes / 60),
    lists: listsRes.count ?? 0,
  };
}

export type ActivityItem = {
  watchedAt: string;
  mediaId: string;
  title: string;
  posterPath: string | null;
  tmdbType: "movie" | "tv";
  tmdbId: string | null;
  episode: { seasonNumber: number; episodeNumber: number; name: string | null } | null;
};

/**
 * Most recent watched entries for a user's public profile timeline.
 */
export async function getRecentActivity(
  userId: string,
  limit = 15,
): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watched_entries")
    .select(
      `watched_at, media_id, episode_id,
       media:media_id ( id, title, poster_path, type ),
       episode:episode_id ( episode_number, name,
         seasons ( season_number ) )`,
    )
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  const mediaIds = [...new Set(data.map((r) => r.media_id as string))];
  const tmdbMap = await getTmdbIdMap(mediaIds);

  return data.map((r) => {
    const media = r.media as unknown as {
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
    };
    const ep = r.episode as unknown as {
      episode_number: number;
      name: string | null;
      seasons: { season_number: number };
    } | null;

    return {
      watchedAt: r.watched_at as string,
      mediaId: r.media_id as string,
      title: media.title,
      posterPath: media.poster_path,
      tmdbType: media.type,
      tmdbId: tmdbMap.get(r.media_id as string) ?? null,
      episode: ep
        ? {
            seasonNumber: ep.seasons?.season_number ?? 0,
            episodeNumber: ep.episode_number,
            name: ep.name,
          }
        : null,
    };
  });
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

  return Promise.all(
    lists.map(async (list) => {
      const listId = list.id as string;
      const [{ count }, { data: items }] = await Promise.all([
        supabase
          .from("custom_list_items")
          .select("media_id", { count: "exact", head: true })
          .eq("list_id", listId),
        supabase
          .from("custom_list_items")
          .select(`media:media_id ( poster_path )`)
          .eq("list_id", listId)
          .order("position", { ascending: true })
          .limit(4),
      ]);

      const coverPosters: (string | null)[] = (items ?? []).map((i) => {
        const m = i.media as unknown as { poster_path: string | null } | null;
        return m?.poster_path ?? null;
      });

      return {
        id: listId,
        name: list.name as string,
        description: list.description as string | null,
        slug: list.slug as string,
        itemCount: count ?? 0,
        coverPosters,
      };
    }),
  );
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
 * Everything the /home Continue Watching section needs, in a couple of
 * bounded round-trips. We deliberately don't do this via a Postgres RPC yet
 * — the join volume is small (≤12 shows × ~50 eps) and the shape of the
 * query is still stabilizing.
 */
export async function getContinueWatching(
  limit = 12,
): Promise<ContinueWatchingItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1) Progress rows + basic media info.
  const { data: progressRows, error: progressError } = await supabase
    .from("show_progress")
    .select(
      `
      media_id,
      current_season,
      current_episode,
      status_changed_at,
      media:media_id (
        id,
        title,
        poster_path,
        type,
        episode_count
      )
    `,
    )
    .eq("user_id", user.id)
    .eq("status", "watching")
    .order("status_changed_at", { ascending: false })
    .limit(limit);

  if (progressError || !progressRows || progressRows.length === 0) return [];

  const mediaIds = progressRows.map((r) => r.media_id);

  // 2) TMDB external IDs (for /title/tv/{id} link building).
  const { data: extIds } = await supabase
    .from("media_external_ids")
    .select("media_id, external_id")
    .eq("source", "tmdb")
    .in("media_id", mediaIds);
  const tmdbMap = new Map<string, string>();
  for (const e of extIds ?? []) {
    tmdbMap.set(e.media_id as string, e.external_id as string);
  }

  // 3) Watched-episode counts per show (for the "totalWatched" number
  //    surfaced on the card without a second aggregation query per row).
  // Paginated: 12 shows at a couple hundred episodes each blows past the
  // 1000-row cap, and this count is shown to the user ("N of M watched"), so
  // a truncated read would under-report real progress.
  const watchedRows = await fetchAllRows<{ media_id: string }>((from, to) =>
    supabase
      .from("watched_entries")
      .select("media_id")
      .eq("user_id", user.id)
      .in("media_id", mediaIds)
      .not("episode_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ media_id: string }[]>(),
  );
  const watchedCounts = new Map<string, number>();
  for (const w of watchedRows) {
    watchedCounts.set(w.media_id, (watchedCounts.get(w.media_id) ?? 0) + 1);
  }

  // 4) Per-show "what's the next episode after where they are?" lookup.
  //    One query per show; capped at `limit`. Each pulls a small episode set,
  //    sort-and-find happens in JS to avoid Supabase-JS's awkward joined-
  //    column ordering.
  const results: ContinueWatchingItem[] = await Promise.all(
    progressRows.map(async (row) => {
      const media = row.media as unknown as {
        id: string;
        title: string;
        poster_path: string | null;
        type: string;
        episode_count: number | null;
      };
      const currentSeason = row.current_season ?? 1;
      const currentEpisode = row.current_episode ?? 0;

      const { data: allEps } = await supabase
        .from("episodes")
        .select(
          `id, episode_number, name, runtime_minutes,
           seasons!inner ( season_number, media_id )`,
        )
        .eq("seasons.media_id", row.media_id);

      const sorted = (allEps ?? [])
        .map((e) => {
          // `episodes.season_id → seasons.id` is many-to-one, so PostgREST
          // embeds `seasons` as a single object, NOT an array. Indexing [0]
          // here silently produced season_number 0 for every episode, which
          // made the "next episode" lookup below never match — every show
          // read as "all caught up". Array branch kept as a cheap guard.
          const embedded = (e as unknown as {
            seasons:
              | { season_number: number }
              | { season_number: number }[]
              | null;
          }).seasons;
          const season = Array.isArray(embedded) ? embedded[0] : embedded;

          return {
            id: e.id as string,
            episode_number: e.episode_number as number,
            name: (e.name as string | null) ?? null,
            runtime_minutes: (e.runtime_minutes as number | null) ?? null,
            season_number: season?.season_number ?? 0,
          };
        })
        .sort((a, b) =>
          a.season_number !== b.season_number
            ? a.season_number - b.season_number
            : a.episode_number - b.episode_number,
        );

      const next = sorted.find(
        (e) =>
          e.season_number > currentSeason ||
          (e.season_number === currentSeason &&
            e.episode_number > currentEpisode),
      );

      return {
        mediaId: row.media_id as string,
        title: media.title,
        posterPath: media.poster_path,
        tmdbId: tmdbMap.get(row.media_id) ?? null,
        tmdbType: "tv" as const,
        currentSeason: row.current_season,
        currentEpisode: row.current_episode,
        totalEpisodes: media.episode_count ?? sorted.length,
        totalWatched: watchedCounts.get(row.media_id) ?? 0,
        next: next
          ? {
              episodeId: next.id,
              seasonNumber: next.season_number,
              episodeNumber: next.episode_number,
              name: next.name,
              runtimeMinutes: next.runtime_minutes,
            }
          : null,
      };
    }),
  );

  return results;
}
