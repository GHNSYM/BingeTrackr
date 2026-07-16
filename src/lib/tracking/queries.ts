import "server-only";
import { createClient } from "@/lib/supabase/server";

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
      media: r.media as Row["media"],
    })),
    ...(shows.data ?? []).map((r) => ({
      media_id: r.media_id as string,
      when: r.status_changed_at as string,
      media: r.media as Row["media"],
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
    const m = r.media as {
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
    const m = r.media as {
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
        .map((e) => ({
          id: e.id as string,
          episode_number: e.episode_number as number,
          name: (e.name as string | null) ?? null,
          runtime_minutes: (e.runtime_minutes as number | null) ?? null,
          season_number:
            (e as { seasons: { season_number: number } }).seasons.season_number,
        }))
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
