import "server-only";
import { createClient } from "@/lib/supabase/server";

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
