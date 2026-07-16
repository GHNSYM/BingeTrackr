"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TrackingResult = { ok: true } | { error: string };

// ─── Movie actions ─────────────────────────────────────────────────────────

export async function markMovieWatchedAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  // Pull runtime for denormalization onto watched_entries.
  const { data: media } = await supabase
    .from("media")
    .select("runtime_minutes, type")
    .eq("id", mediaId)
    .single();
  if (!media) return { error: "media-not-found" };
  if (media.type !== "movie") return { error: "not-a-movie" };

  // Idempotent: skip insert if already watched. (Rewatches use a separate flow later.)
  const { data: existing } = await supabase
    .from("watched_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .is("episode_id", null)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("watched_entries").insert({
      user_id: user.id,
      media_id: mediaId,
      episode_id: null,
      runtime_minutes: media.runtime_minutes ?? null,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/title/movie/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

export async function unmarkMovieWatchedAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("watched_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .is("episode_id", null);

  if (error) return { error: error.message };
  revalidatePath("/title/movie/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

// ─── Episode actions ───────────────────────────────────────────────────────

export async function markEpisodeWatchedAction(args: {
  mediaId: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { data: ep } = await supabase
    .from("episodes")
    .select("runtime_minutes")
    .eq("id", args.episodeId)
    .maybeSingle();

  // Idempotent insert of the watched_entry.
  const { data: existing } = await supabase
    .from("watched_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_id", args.mediaId)
    .eq("episode_id", args.episodeId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("watched_entries").insert({
      user_id: user.id,
      media_id: args.mediaId,
      episode_id: args.episodeId,
      runtime_minutes: ep?.runtime_minutes ?? null,
    });
    if (error) return { error: error.message };
  }

  // Upsert show_progress. The status stays 'completed' if it was; otherwise
  // any mark bumps it to 'watching'.
  const { data: currentProgress } = await supabase
    .from("show_progress")
    .select("status")
    .eq("user_id", user.id)
    .eq("media_id", args.mediaId)
    .maybeSingle();

  const status =
    currentProgress?.status === "completed" ? "completed" : "watching";

  const { error: progressError } = await supabase.from("show_progress").upsert(
    {
      user_id: user.id,
      media_id: args.mediaId,
      current_season: args.seasonNumber,
      current_episode: args.episodeNumber,
      last_watched_episode: args.episodeId,
      status,
      status_changed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id" },
  );

  if (progressError) return { error: progressError.message };

  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

export async function unmarkEpisodeAction(args: {
  mediaId: string;
  episodeId: string;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("watched_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", args.mediaId)
    .eq("episode_id", args.episodeId);

  if (error) return { error: error.message };
  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

// ─── Bulk season actions ───────────────────────────────────────────────────

/**
 * Mark every episode in a season as watched. Skips episodes the user already
 * has (idempotent) and moves show_progress to the last episode of the season.
 * Big UX win for retroactively logging a whole binged season.
 */
export async function markSeasonWatchedAction(args: {
  mediaId: string;
  seasonNumber: number;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  // Fetch all episodes for this season via the seasons join.
  const { data: episodes, error: epError } = await supabase
    .from("episodes")
    .select(
      `id, episode_number, runtime_minutes,
       seasons!inner ( season_number, media_id )`,
    )
    .eq("seasons.media_id", args.mediaId)
    .eq("seasons.season_number", args.seasonNumber);

  if (epError) return { error: epError.message };
  if (!episodes || episodes.length === 0) return { error: "no-episodes" };

  const episodeIds = episodes.map((e) => e.id as string);

  // Which ones does the user already have?
  const { data: alreadyWatched } = await supabase
    .from("watched_entries")
    .select("episode_id")
    .eq("user_id", user.id)
    .in("episode_id", episodeIds);
  const watchedSet = new Set(
    (alreadyWatched ?? []).map((w) => w.episode_id as string),
  );

  const toInsert = episodes
    .filter((e) => !watchedSet.has(e.id as string))
    .map((e) => ({
      user_id: user.id,
      media_id: args.mediaId,
      episode_id: e.id as string,
      runtime_minutes: (e.runtime_minutes as number | null) ?? null,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from("watched_entries").insert(toInsert);
    if (error) return { error: error.message };
  }

  // Move progress to the last episode of this season.
  const lastEp = [...episodes].sort(
    (a, b) => (b.episode_number as number) - (a.episode_number as number),
  )[0];

  const { data: currentProgress } = await supabase
    .from("show_progress")
    .select("status")
    .eq("user_id", user.id)
    .eq("media_id", args.mediaId)
    .maybeSingle();
  const status =
    currentProgress?.status === "completed" ? "completed" : "watching";

  const { error: progressError } = await supabase.from("show_progress").upsert(
    {
      user_id: user.id,
      media_id: args.mediaId,
      current_season: args.seasonNumber,
      current_episode: lastEp.episode_number as number,
      last_watched_episode: lastEp.id as string,
      status,
      status_changed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id" },
  );

  if (progressError) return { error: progressError.message };

  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

/**
 * Delete all watched_entries for episodes in a season. Leaves show_progress
 * alone (user can manually move the resume point if they want).
 */
export async function unmarkSeasonWatchedAction(args: {
  mediaId: string;
  seasonNumber: number;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { data: episodes, error: epError } = await supabase
    .from("episodes")
    .select(`id, seasons!inner ( season_number, media_id )`)
    .eq("seasons.media_id", args.mediaId)
    .eq("seasons.season_number", args.seasonNumber);

  if (epError) return { error: epError.message };
  if (!episodes || episodes.length === 0) return { ok: true };

  const episodeIds = episodes.map((e) => e.id as string);

  const { error } = await supabase
    .from("watched_entries")
    .delete()
    .eq("user_id", user.id)
    .in("episode_id", episodeIds);

  if (error) return { error: error.message };

  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

// ─── Show status ───────────────────────────────────────────────────────────

export type ShowStatus = "watching" | "paused" | "completed" | "dropped";

export async function setShowStatusAction(args: {
  mediaId: string;
  status: ShowStatus;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase.from("show_progress").upsert(
    {
      user_id: user.id,
      media_id: args.mediaId,
      status: args.status,
      status_changed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

// ─── Watchlist ─────────────────────────────────────────────────────────────

export async function toggleWatchlistAction(
  mediaId: string,
): Promise<TrackingResult & { inWatchlist?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { data: existing } = await supabase
    .from("watchlist_entries")
    .select("media_id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("watchlist_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("media_id", mediaId);
    if (error) return { error: error.message };
    revalidatePath("/title/[type]/[id]", "layout");
    revalidatePath("/home");
    return { ok: true, inWatchlist: false };
  } else {
    const { error } = await supabase.from("watchlist_entries").insert({
      user_id: user.id,
      media_id: mediaId,
    });
    if (error) return { error: error.message };
    revalidatePath("/title/[type]/[id]", "layout");
    revalidatePath("/home");
    return { ok: true, inWatchlist: true };
  }
}

// ─── Ratings ───────────────────────────────────────────────────────────────

export async function rateMediaAction(args: {
  mediaId: string;
  score: number;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  if (
    !Number.isInteger(args.score) ||
    args.score < 1 ||
    args.score > 10
  ) {
    return { error: "invalid-score" };
  }

  const { error } = await supabase.from("ratings").upsert(
    {
      user_id: user.id,
      media_id: args.mediaId,
      score: args.score,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/title/[type]/[id]", "layout");
  return { ok: true };
}

export async function unrateMediaAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("ratings")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId);

  if (error) return { error: error.message };
  revalidatePath("/title/[type]/[id]", "layout");
  return { ok: true };
}

// ─── Reads (for server components) ─────────────────────────────────────────

export type ShowProgress = {
  status: ShowStatus;
  current_season: number | null;
  current_episode: number | null;
  last_watched_episode: string | null;
};

export async function getShowProgress(
  mediaId: string,
): Promise<ShowProgress | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("show_progress")
    .select("status, current_season, current_episode, last_watched_episode")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  return (data ?? null) as ShowProgress | null;
}

export async function isInWatchlist(mediaId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("watchlist_entries")
    .select("media_id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  return !!data;
}

export async function getMyRating(mediaId: string): Promise<number | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("ratings")
    .select("score")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  return (data?.score as number | null) ?? null;
}

export async function isMovieWatched(mediaId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("watched_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .is("episode_id", null)
    .maybeSingle();

  return !!data;
}
