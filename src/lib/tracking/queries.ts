import "server-only";
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
 * Counts for the tab badges. Five small queries in parallel; each is a
 * head-only count (no rows returned, just the aggregate).
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
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "dropped"),
  ]);

  return {
    watching: watchingRes.count ?? 0,
    watched: (watchedMoviesRes.count ?? 0) + (completedShowsRes.count ?? 0),
    watchlist: watchlistRes.count ?? 0,
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

  const [movies, shows] = await Promise.all([
    supabase
      .from("watched_entries")
      .select(
        `media_id, watched_at,
         media:media_id ( id, title, poster_path, type, release_year )`,
      )
      .eq("user_id", user.id)
      .is("episode_id", null)
      .order("watched_at", { ascending: false }),
    supabase
      .from("show_progress")
      .select(
        `media_id, status_changed_at,
         media:media_id ( id, title, poster_path, type, release_year )`,
      )
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("status_changed_at", { ascending: false }),
  ]);

  type Row = {
    media_id: string;
    when: string;
    media: {
      id: string;
      title: string;
      poster_path: string | null;
      type: "movie" | "tv";
      release_year: number | null;
    };
  };

  const rows: Row[] = [
    ...(movies.data ?? []).map((r) => ({
      media_id: r.media_id as string,
      when: r.watched_at as string,
      media: r.media as unknown as Row["media"],
    })),
    ...(shows.data ?? []).map((r) => ({
      media_id: r.media_id as string,
      when: r.status_changed_at as string,
      media: r.media as unknown as Row["media"],
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

  const { data } = await supabase
    .from("watchlist_entries")
    .select(
      `media_id, added_at, priority,
       media:media_id ( id, title, poster_path, type, release_year )`,
    )
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("added_at", { ascending: false });

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

function relativeWhen(iso: string, prefix = "Watched"): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return `${prefix} · today`;
  if (days === 1) return `${prefix} · yesterday`;
  if (days < 7) return `${prefix} · ${days}d ago`;
  if (days < 30) return `${prefix} · ${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${prefix} · ${Math.floor(days / 30)}mo ago`;
  return `${prefix} · ${Math.floor(days / 365)}y ago`;
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

  const [entriesRes, completedRes] = await Promise.all([
    supabase
      .from("watched_entries")
      .select(
        `watched_at, runtime_minutes, media_id, episode_id,
         media:media_id ( id, title, poster_path, type )`,
      )
      .eq("user_id", targetUserId),
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("status", "completed"),
  ]);

  const entries = entriesRes.data ?? [];
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

  const [assignmentsRes, labelsRes, watchedMoviesRes, progressRes] =
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
      supabase
        .from("watched_entries")
        .select(
          `media_id,
           media:media_id ( id, title, poster_path, type, release_year )`,
        )
        .eq("user_id", user.id)
        .is("episode_id", null),
      supabase
        .from("show_progress")
        .select(
          `media_id,
           media:media_id ( id, title, poster_path, type, release_year )`,
        )
        .eq("user_id", user.id),
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
    ...(watchedMoviesRes.data ?? []),
    ...(progressRes.data ?? []),
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
  const [showsRes, episodesRes, entriesRes, listsRes] = await Promise.all([
    supabase
      .from("show_progress")
      .select("media_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("watched_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("episode_id", "is", null),
    supabase
      .from("watched_entries")
      .select("runtime_minutes")
      .eq("user_id", userId),
    supabase
      .from("custom_lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_public", true),
  ]);

  const totalMinutes = (entriesRes.data ?? []).reduce(
    (sum, r) => sum + ((r.runtime_minutes as number | null) ?? 0),
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
  const { data: watchedRows } = await supabase
    .from("watched_entries")
    .select("media_id")
    .eq("user_id", user.id)
    .in("media_id", mediaIds)
    .not("episode_id", "is", null);
  const watchedCounts = new Map<string, number>();
  for (const w of watchedRows ?? []) {
    const mid = w.media_id as string;
    watchedCounts.set(mid, (watchedCounts.get(mid) ?? 0) + 1);
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
          const season = (e as unknown as {
            seasons: { season_number: number }[];
          }).seasons?.[0];

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
