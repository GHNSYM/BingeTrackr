"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { getMovie, getTv, type TmdbMediaType } from "@/lib/tmdb/client";
import { upsertMovie, upsertTv } from "@/lib/tmdb/upsert";
import {
  markMovieWatchedAction,
  setShowStatusAction,
  toggleWatchlistAction,
  unmarkMovieWatchedAction,
} from "./actions";

/**
 * Poster-level quick actions (Discover / Library hover buttons).
 *
 * Those surfaces only know a title by its TMDB id, while every tracking table
 * keys off our internal `media.id`. So each action resolves TMDB → internal
 * first, caching the title on the way in (cache-on-touch, same as a detail
 * page visit).
 *
 * Both actions return the FULL resulting state, not just the flag they
 * touched: marking something watched also evicts it from the watchlist, and
 * the poster's two buttons have to reflect that in one round-trip.
 */

export type QuickActionResult =
  | { ok: true; watched: boolean; watchlisted: boolean }
  | { error: string };

type Target = { tmdbId: number | string; tmdbType: TmdbMediaType };

/**
 * TMDB id → internal `media.id`.
 *
 * Fast path: if we've already cached this title, `media_external_ids` has the
 * mapping and we need neither the TMDB fetch nor the `media` UPDATE that
 * `upsertMedia` would do. That's the common case on Discover — most clicked
 * posters are ones someone has already touched.
 *
 * `(source, external_id, media_type)` is the primary key, so this is a single
 * indexed lookup that cannot return a row of the wrong type. It used to need a
 * join to `media` plus a post-hoc type check, because the narrower PK let movie
 * 550 and show 550 collide — that's fixed in the schema now, so the guard is
 * gone rather than merely working.
 *
 * Slow path: fetch details server-side and cache-on-touch. We refetch rather
 * than trusting a payload from the client — otherwise a caller could write
 * arbitrary rows into `media` — but that reasoning only applies when we
 * actually need to insert.
 */
async function resolveMediaId({ tmdbId, tmdbType }: Target): Promise<string> {
  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("media_external_ids")
    .select("media_id")
    .eq("source", "tmdb")
    .eq("external_id", String(tmdbId))
    .eq("media_type", tmdbType)
    .maybeSingle();

  if (cached?.media_id) return cached.media_id as string;

  if (tmdbType === "movie") return upsertMovie(await getMovie(tmdbId));
  return upsertTv(await getTv(tmdbId));
}

/** Discover and Library both show tracking state, so both need busting. */
function revalidateGrids() {
  revalidatePath("/discover");
  revalidatePath("/library");
  revalidatePath("/home");
}

async function readState(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
  tmdbType: TmdbMediaType,
): Promise<{ watched: boolean; watchlisted: boolean }> {
  const [watchedRes, progressRes, watchlistRes] = await Promise.all([
    tmdbType === "movie"
      ? supabase
          .from("watched_entries")
          .select("id")
          .eq("user_id", userId)
          .eq("media_id", mediaId)
          .is("episode_id", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tmdbType === "tv"
      ? supabase
          .from("show_progress")
          .select("status")
          .eq("user_id", userId)
          .eq("media_id", mediaId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("watchlist_entries")
      .select("media_id")
      .eq("user_id", userId)
      .eq("media_id", mediaId)
      .maybeSingle(),
  ]);

  const watched =
    tmdbType === "movie"
      ? !!watchedRes.data
      : (progressRes.data as { status?: string } | null)?.status === "completed";

  return { watched, watchlisted: !!watchlistRes.data };
}

export async function quickToggleWatchlistAction(
  target: Target,
): Promise<QuickActionResult> {
  try {
    const mediaId = await resolveMediaId(target);
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) return { error: "not-signed-in" };

    const result = await toggleWatchlistAction(mediaId);
    if ("error" in result) return { error: result.error };

    revalidateGrids();
    const state = await readState(supabase, user.id, mediaId, target.tmdbType);
    return { ok: true, ...state };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * "Watched" means different things per type, matching how the Library counts
 * it: a movie has a watched_entry, a series is set to `completed` (which also
 * back-fills every episode via setShowStatusAction, and drops it from the
 * watchlist).
 *
 * Un-toggling a series drops it back to `watching` rather than deleting its
 * entries — a stray click shouldn't wipe real episode history.
 */
export async function quickToggleWatchedAction(
  target: Target,
): Promise<QuickActionResult> {
  try {
    const mediaId = await resolveMediaId(target);
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) return { error: "not-signed-in" };

    const before = await readState(
      supabase,
      user.id,
      mediaId,
      target.tmdbType,
    );

    if (target.tmdbType === "movie") {
      const result = before.watched
        ? await unmarkMovieWatchedAction(mediaId)
        : await markMovieWatchedAction(mediaId);
      if ("error" in result) return { error: result.error };
    } else {
      const result = await setShowStatusAction({
        mediaId,
        status: before.watched ? "watching" : "completed",
      });
      if ("error" in result) return { error: result.error };
    }

    revalidateGrids();
    const state = await readState(supabase, user.id, mediaId, target.tmdbType);
    return { ok: true, ...state };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
