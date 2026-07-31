"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/current-user";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import { getTv } from "@/lib/tmdb/client";
import { ensureSeasonCached } from "@/lib/tmdb/seasons";

export type TrackingResult = { ok: true } | { error: string };

/**
 * A title is either "to watch" or "watched" — never both. Finishing something
 * therefore evicts it from the watchlist.
 *
 * Deliberately NOT called when a show merely moves to `watching`: a part-way
 * series legitimately stays on the watchlist, since the user still intends to
 * watch the rest of it.
 *
 * Best-effort. The watchlist is a convenience list; failing to prune it must
 * never fail the watch itself.
 */
async function dropFromWatchlist(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<void> {
  const { error } = await supabase
    .from("watchlist_entries")
    .delete()
    .eq("user_id", userId)
    .eq("media_id", mediaId);
  if (error) {
    console.error("dropFromWatchlist failed:", error.message);
  }
}

// ─── Movie actions ─────────────────────────────────────────────────────────

export async function markMovieWatchedAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
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

  // Watched now — it's no longer something to watch.
  await dropFromWatchlist(supabase, user.id, mediaId);

  revalidatePath("/title/[type]/[id]", "layout");
  revalidatePath("/home");
  revalidatePath("/library");
  return { ok: true };
}

export async function unmarkMovieWatchedAction(
  mediaId: string,
): Promise<TrackingResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("watched_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .is("episode_id", null);

  if (error) return { error: error.message };
  revalidatePath("/title/[type]/[id]", "layout");
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
  const user = await getCurrentUser();
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

  // Only if this landed on (or stayed) completed — a show still in progress
  // keeps its watchlist entry.
  if (status === "completed") {
    await dropFromWatchlist(supabase, user.id, args.mediaId);
  }

  revalidatePath("/title/[type]/[id]", "layout");
  revalidatePath("/home");
  revalidatePath("/library");
  return { ok: true };
}

export async function unmarkEpisodeAction(args: {
  mediaId: string;
  episodeId: string;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("watched_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", args.mediaId)
    .eq("episode_id", args.episodeId);

  if (error) return { error: error.message };
  revalidatePath("/title/[type]/[id]", "layout");
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
  const user = await getCurrentUser();
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

  if (status === "completed") {
    await dropFromWatchlist(supabase, user.id, args.mediaId);
  }

  revalidatePath("/title/[type]/[id]", "layout");
  revalidatePath("/home");
  revalidatePath("/library");
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
  const user = await getCurrentUser();
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

  revalidatePath("/title/[type]/[id]", "layout");
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
  const user = await getCurrentUser();
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
    // Completed leaves the watchlist. `watching` deliberately does not — a
    // half-finished series is still something the user means to watch.
    await dropFromWatchlist(supabase, user.id, args.mediaId);
  }

  revalidatePath("/title/[type]/[id]", "layout");
  revalidatePath("/home");
  revalidatePath("/library");
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
  // 1) Cache all seasons via TMDB. Requires the show's tmdb id, which is
  //    cached on `media` by trigger — no need to hit media_external_ids.
  const { data: mediaRow } = await supabase
    .from("media")
    .select("tmdb_id")
    .eq("id", mediaId)
    .maybeSingle();

  const tmdbId = mediaRow?.tmdb_id as string | null | undefined;
  if (tmdbId) {
    const tv = await getTv(tmdbId);
    const realSeasons = tv.seasons.filter((s) => s.season_number > 0);
    // Parallel cache-fill — TMDB has generous rate limits so even a 20-
    // season show completes in ~one round-trip.
    await Promise.all(
      realSeasons.map((s) =>
        ensureSeasonCached(mediaId, tmdbId, s.season_number).catch((err) => {
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

  // Paginated — a 1000+ episode show would otherwise be silently truncated
  // here, so "mark completed" would only ever mark the first 1000.
  type EpisodeRow = {
    id: string;
    episode_number: number;
    runtime_minutes: number | null;
    season_id: string;
  };
  const episodes = await fetchAllRows<EpisodeRow>((from, to) =>
    supabase
      .from("episodes")
      .select("id, episode_number, runtime_minutes, season_id")
      .in("season_id", seasonIds)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<EpisodeRow[]>(),
  );
  if (episodes.length === 0) return;

  // 3) Find which the user hasn't already marked.
  const episodeIds = episodes.map((e) => e.id);
  const already = await fetchAllRows<{ episode_id: string }>((from, to) =>
    supabase
      .from("watched_entries")
      .select("episode_id")
      .eq("user_id", userId)
      .in("episode_id", episodeIds)
      .order("episode_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ episode_id: string }[]>(),
  );
  const alreadySet = new Set(already.map((r) => r.episode_id));

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

/**
 * Is this title finished — a watched movie, or a series set to Completed?
 *
 * This is the same definition `getFinishedMediaIds` uses on the read side. A
 * series merely in progress is NOT finished: a half-watched show legitimately
 * stays on the watchlist, which is why `dropFromWatchlist` isn't called when a
 * show moves to `watching`.
 */
async function isFinished(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const [watchedMovie, completedShow] = await Promise.all([
    supabase
      .from("watched_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("media_id", mediaId)
      .is("episode_id", null)
      .maybeSingle(),
    supabase
      .from("show_progress")
      .select("media_id")
      .eq("user_id", userId)
      .eq("media_id", mediaId)
      .eq("status", "completed")
      .maybeSingle(),
  ]);
  return !!watchedMovie.data || !!completedShow.data;
}

/**
 * Add to / remove from the watchlist.
 *
 * "Watched" and "to watch" are mutually exclusive — see `dropFromWatchlist`.
 * That rule was only ever enforced in ONE direction: finishing something evicted
 * it from the watchlist, but adding a finished title TO the watchlist happily
 * inserted a row. `getWatchlistItems` then hid that row at read time, so the
 * poster buttons showed both states lit while the Library showed only one. The
 * UI was reporting the database honestly; the database was the thing that was
 * wrong.
 *
 * Adding is therefore refused for a finished title. Refusing rather than
 * silently un-watching it is deliberate: clearing a movie's watched entry would
 * destroy its watch date and change the user's stats, and re-watching is
 * explicitly a later flow (see `markMovieWatchedAction`). To watchlist something
 * you've finished, un-mark it first — one click, already supported.
 */
export async function toggleWatchlistAction(
  mediaId: string,
): Promise<TrackingResult & { inWatchlist?: boolean }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "not-signed-in" };

  const { data: existing } = await supabase
    .from("watchlist_entries")
    .select("media_id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  if (existing) {
    // Removing is always allowed.
    const { error } = await supabase
      .from("watchlist_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("media_id", mediaId);
    if (error) return { error: error.message };
    revalidatePath("/title/[type]/[id]", "layout");
    revalidatePath("/home");
    revalidatePath("/library");
    return { ok: true, inWatchlist: false };
  }

  if (await isFinished(supabase, user.id, mediaId)) {
    return { error: "already-watched" };
  }

  const { error } = await supabase.from("watchlist_entries").insert({
    user_id: user.id,
    media_id: mediaId,
  });
  if (error) return { error: error.message };
  revalidatePath("/title/[type]/[id]", "layout");
  revalidatePath("/home");
  revalidatePath("/library");
  return { ok: true, inWatchlist: true };
}

// ─── Ratings ───────────────────────────────────────────────────────────────

export async function rateMediaAction(args: {
  mediaId: string;
  score: number;
}): Promise<TrackingResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
