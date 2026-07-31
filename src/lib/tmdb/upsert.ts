import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  TmdbMovieDetails,
  TmdbSearchResult,
  TmdbTvDetails,
} from "./client";
import { originalTitleFromResult, titleFromResult, yearFromResult } from "./client";

/**
 * Cache-on-touch: given a TMDB payload, upsert a `media` row (and its
 * external_id mapping). Returns our internal media UUID.
 *
 * For search results we only have thin data — enough to render a poster
 * card, not enough for a detail page. So we mark last_synced_at ~far in the
 * past when caching from search, so a detail-page visit triggers a refresh.
 */
export async function upsertMediaFromSearchResult(
  r: TmdbSearchResult & { media_type: "movie" | "tv" },
): Promise<string> {
  return upsertMedia({
    tmdbId: r.id,
    type: r.media_type,
    title: titleFromResult(r),
    original_title: originalTitleFromResult(r),
    overview: r.overview ?? null,
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    release_year: yearFromResult(r),
    runtime_minutes: null,
    episode_count: null,
    thin: true,
  });
}

export async function upsertMovie(m: TmdbMovieDetails): Promise<string> {
  return upsertMedia({
    tmdbId: m.id,
    type: "movie",
    title: m.title,
    original_title: m.original_title,
    overview: m.overview,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    release_year: yearFromDateString(m.release_date),
    runtime_minutes: m.runtime ?? null,
    episode_count: null,
    thin: false,
  });
}

export async function upsertTv(t: TmdbTvDetails): Promise<string> {
  return upsertMedia({
    tmdbId: t.id,
    type: "tv",
    title: t.name,
    original_title: t.original_name,
    overview: t.overview,
    poster_path: t.poster_path,
    backdrop_path: t.backdrop_path,
    release_year: yearFromDateString(t.first_air_date),
    runtime_minutes: t.episode_run_time?.[0] ?? null,
    episode_count: t.number_of_episodes ?? null,
    thin: false,
  });
}

// ─── Internal ──────────────────────────────────────────────────────────────

type UpsertArgs = {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_year: number | null;
  runtime_minutes: number | null;
  episode_count: number | null;
  thin: boolean;
};

async function upsertMedia(args: UpsertArgs): Promise<string> {
  const admin = createAdminClient();

  // Fast path: do we already have a media row for this TMDB id?
  //
  // `media_type` is part of the primary key — TMDB numbers movies and shows in
  // separate namespaces, so without it movie 550 and show 550 resolved to one
  // row and this lookup could return, and then overwrite, the wrong title.
  const { data: existing } = await admin
    .from("media_external_ids")
    .select("media_id")
    .eq("source", "tmdb")
    .eq("external_id", String(args.tmdbId))
    .eq("media_type", args.type)
    .maybeSingle();

  if (existing?.media_id) {
    // Only refresh the media row if this is a full-fat payload; skip if thin.
    if (!args.thin) {
      await admin
        .from("media")
        .update({
          title: args.title,
          original_title: args.original_title,
          overview: args.overview,
          poster_path: args.poster_path,
          backdrop_path: args.backdrop_path,
          release_year: args.release_year,
          runtime_minutes: args.runtime_minutes,
          episode_count: args.episode_count,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.media_id);
    }
    return existing.media_id as string;
  }

  // Insert new media row.
  const { data: media, error: mediaError } = await admin
    .from("media")
    .insert({
      type: args.type,
      title: args.title,
      original_title: args.original_title,
      overview: args.overview,
      poster_path: args.poster_path,
      backdrop_path: args.backdrop_path,
      release_year: args.release_year,
      runtime_minutes: args.runtime_minutes,
      episode_count: args.episode_count,
      // If thin, backdate so next detail visit triggers a refresh.
      last_synced_at: args.thin
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (mediaError || !media) {
    throw new Error(`upsertMedia insert failed: ${mediaError?.message}`);
  }

  const { error: extError } = await admin
    .from("media_external_ids")
    .insert({
      media_id: media.id,
      source: "tmdb",
      external_id: String(args.tmdbId),
      // NOT NULL, and a composite FK checks it against media.type. Inserting
      // the media row above with a different type would be rejected here.
      media_type: args.type,
    });

  if (extError) {
    // Rollback the media row so we don't leave orphans.
    await admin.from("media").delete().eq("id", media.id);
    throw new Error(`upsertMedia external_id insert failed: ${extError.message}`);
  }

  return media.id as string;
}

function yearFromDateString(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}
