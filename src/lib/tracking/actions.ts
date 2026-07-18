"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTv } from "@/lib/tmdb/client";
import { ensureSeasonCached } from "@/lib/tmdb/seasons";

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

  // Primary: update the status. Do this first so a failure in the
  // mark-all path below doesn't lose the user's status change.
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

  // Secondary: when a user marks a show as Completed, they've clearly
  // finished it. Auto-mark every episode as watched (best-effort — a
  // partial cache miss shouldn't fail the status change).
  if (args.status === "completed") {
    try {
      await markEveryEpisodeWatched(supabase, user.id, args.mediaId);
    } catch (err) {
      console.error("auto mark-all on completed failed:", err);
    }
  }

  revalidatePath("/title/tv/[id]", "layout");
  revalidatePath("/home");
  return { ok: true };
}

/**
 * Given a show's media_id, ensure every season+episode is cached (fetches
 * from TMDB in parallel), then batch-insert watched_entries for anything
 * the user hasn't already marked, and point show_progress at the last
 * episode of the last season.
 */
async function markEveryEpisodeWatched(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<void> {
  // 1) Cache all seasons via TMDB. Requires the show's tmdb id.
  const { data: extId } = await supabase
    .from("media_external_ids")
    .select("external_id")
    .eq("media_id", mediaId)
    .eq("source", "tmdb")
    .maybeSingle();

  if (extId?.external_id) {
    const tv = await getTv(extId.external_id as string);
    const realSeasons = tv.seasons.filter((s) => s.season_number > 0);
    // Parallel cache-fill — TMDB has generous rate limits so even a 20-
    // season show completes in ~one round-trip.
    await Promise.all(
      realSeasons.map((s) =>
        ensureSeasonCached(
          mediaId,
          extId.external_id as string,
          s.season_number,
        ).catch((err) => {
          console.error(`ensureSeasonCached S${s.season_number} failed`, err);
        }),
      ),
    );
  }

  // 2) Pull every cached episode for this show.
  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, season_number")
    .eq("media_id", mediaId);
  if (!seasons || seasons.length === 0) return;

  const seasonIds = (seasons as { id: string; season_number: number }[]).map(
    (s) => s.id,
  );
  const seasonNumberById = new Map<string, number>(
    (seasons as { id: string; season_number: number }[]).map((s) => [
      s.id,
      s.season_number,
    ]),
  );

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, runtime_minutes, season_id")
    .in("season_id", seasonIds);
  if (!episodes || episodes.length === 0) return;

  // 3) Find which the user hasn't already marked.
  const episodeIds = episodes.map((e) => e.id as string);
  const { data: already } = await supabase
    .from("watched_entries")
    .select("episode_id")
    .eq("user_id", userId)
    .in("episode_id", episodeIds);
  const alreadySet = new Set(
    (already ?? []).map((r) => r.episode_id as string),
  );

  const toInsert = episodes
    .filter((e) => !alreadySet.has(e.id as string))
    .map((e) => ({
      user_id: userId,
      media_id: mediaId,
      episode_id: e.id as string,
      runtime_minutes: (e.runtime_minutes as number | null) ?? null,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from("watched_entries").insert(toInsert);
    if (error) throw new Error(`mark-all insert failed: ${error.message}`);
  }

  // 4) Point show_progress at the last episode of the last season.
  const withSeason = episodes.map((e) => ({
    id: e.id as string,
    episode_number: e.episode_number as number,
    season_number:
      seasonNumberById.get(e.season_id as string) ?? 0,
  }));
  withSeason.sort((a, b) => {
    if (a.season_number !== b.season_number) {
      return b.season_number - a.season_number;
    }
    return b.episode_number - a.episode_number;
  });
  const lastEp = withSeason[0];
  if (lastEp) {
    await supabase.from("show_progress").upsert(
      {
        user_id: userId,
        media_id: mediaId,
        status: "completed",
        current_season: lastEp.season_number,
        current_episode: lastEp.episode_number,
        last_watched_episode: lastEp.id,
        status_changed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,media_id" },
    );
  }
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

// ─── Tier board actions ────────────────────────────────────────────────────

export type TierKey = "S" | "A" | "B" | "C" | "D";

const TIER_LABEL_COLUMN: Record<TierKey, "s_label" | "a_label" | "b_label" | "c_label" | "d_label"> = {
  S: "s_label",
  A: "a_label",
  B: "b_label",
  C: "c_label",
  D: "d_label",
};

export async function assignTierAction(args: {
  mediaId: string;
  tier: TierKey;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase.from("tier_assignments").upsert(
    {
      user_id: user.id,
      media_id: args.mediaId,
      tier: args.tier,
    },
    { onConflict: "user_id,media_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/tiers");
  return { ok: true };
}

export async function removeTierAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("tier_assignments")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId);

  if (error) return { error: error.message };
  revalidatePath("/tiers");
  return { ok: true };
}

export async function renameTierLabelAction(args: {
  tier: TierKey;
  label: string;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const trimmed = args.label.trim().slice(0, 3);
  if (!trimmed) return { error: "empty-label" };

  // Ensure a labels row exists (schema check enforces max 3 chars per column).
  await supabase
    .from("tier_labels")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  const column = TIER_LABEL_COLUMN[args.tier];
  const { error } = await supabase
    .from("tier_labels")
    .update({ [column]: trimmed, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/tiers");
  return { ok: true };
}

export async function resetTierBoardAction(): Promise<TrackingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("tier_assignments")
    .delete()
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/tiers");
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
