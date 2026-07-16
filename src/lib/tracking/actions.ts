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
