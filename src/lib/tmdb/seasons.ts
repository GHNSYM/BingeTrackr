import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeason } from "./client";

export type EpisodeRow = {
  id: string;
  season_id: string;
  episode_number: number;
  name: string | null;
  runtime_minutes: number | null;
  air_date: string | null;
};

export type SeasonWithEpisodes = {
  id: string;
  season_number: number;
  name: string | null;
  episode_count: number | null;
  episodes: EpisodeRow[];
};

/**
 * Ensure a season's row + episodes are in our DB. Fetches from TMDB if
 * the local copy is missing or stale. Idempotent — safe to call every render.
 * Returns the season row + its episodes in air-order.
 */
export async function ensureSeasonCached(
  mediaId: string,
  tmdbTvId: number | string,
  seasonNumber: number,
): Promise<SeasonWithEpisodes> {
  const admin = createAdminClient();

  // Do we already have this season with episodes?
  const { data: existingSeason } = await admin
    .from("seasons")
    .select("id, season_number, name, episode_count")
    .eq("media_id", mediaId)
    .eq("season_number", seasonNumber)
    .maybeSingle();

  if (existingSeason) {
    const { data: episodes } = await admin
      .from("episodes")
      .select("id, season_id, episode_number, name, runtime_minutes, air_date")
      .eq("season_id", existingSeason.id)
      .order("episode_number", { ascending: true });

    if (episodes && episodes.length > 0) {
      return {
        id: existingSeason.id as string,
        season_number: existingSeason.season_number as number,
        name: existingSeason.name as string | null,
        episode_count: existingSeason.episode_count as number | null,
        episodes: episodes as EpisodeRow[],
      };
    }
    // Season exists but no episodes cached — fall through to fetch.
  }

  // Fetch from TMDB.
  const tmdbSeason = await getSeason(tmdbTvId, seasonNumber);

  // Upsert the season row.
  const { data: seasonRow, error: seasonError } = await admin
    .from("seasons")
    .upsert(
      {
        media_id: mediaId,
        season_number: seasonNumber,
        name: tmdbSeason.name,
        episode_count: tmdbSeason.episodes.length,
        air_date: tmdbSeason.air_date,
      },
      { onConflict: "media_id,season_number" },
    )
    .select("id")
    .single();

  if (seasonError || !seasonRow) {
    throw new Error(`ensureSeasonCached: season upsert failed: ${seasonError?.message}`);
  }

  const seasonId = seasonRow.id as string;

  // Upsert episodes in one batch.
  const episodeRows = tmdbSeason.episodes.map((ep) => ({
    season_id: seasonId,
    episode_number: ep.episode_number,
    name: ep.name,
    runtime_minutes: ep.runtime,
    air_date: ep.air_date,
  }));

  const { error: epError } = await admin
    .from("episodes")
    .upsert(episodeRows, { onConflict: "season_id,episode_number" });

  if (epError) {
    throw new Error(`ensureSeasonCached: episodes upsert failed: ${epError.message}`);
  }

  const { data: freshEpisodes } = await admin
    .from("episodes")
    .select("id, season_id, episode_number, name, runtime_minutes, air_date")
    .eq("season_id", seasonId)
    .order("episode_number", { ascending: true });

  return {
    id: seasonId,
    season_number: seasonNumber,
    name: tmdbSeason.name,
    episode_count: tmdbSeason.episodes.length,
    episodes: (freshEpisodes ?? []) as EpisodeRow[],
  };
}

/**
 * Fetch the set of episode ids that a user has marked watched for a given
 * show. Returns a Set for O(1) lookup while rendering rows.
 */
export async function getUserWatchedEpisodeIds(
  mediaId: string,
): Promise<Set<string>> {
  const admin = createAdminClient();
  const { createClient } = await import("@/lib/supabase/server");
  const supa = await createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return new Set();

  const { data } = await admin
    .from("watched_entries")
    .select("episode_id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .not("episode_id", "is", null);

  return new Set((data ?? []).map((r) => r.episode_id as string));
}
