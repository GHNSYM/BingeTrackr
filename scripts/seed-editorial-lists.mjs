#!/usr/bin/env node
/**
 * Seeds/updates Discover's editorial rows — Franchises and Must-watches
 * (`lib/discover/editorial.ts`). Re-run any time to add a franchise, add a
 * pick, or refresh posters; it's idempotent (upserts, and replaces each
 * list's items rather than appending) — safe to run repeatedly.
 *
 * Usage (from the `web/` directory):
 *   node --env-file=.env scripts/seed-editorial-lists.mjs
 *
 * To edit the curated content, edit the FRANCHISES / MUST_WATCHES arrays
 * below and re-run. Every TMDB id in them was verified live against the API
 * before being hardcoded (search results, not guesses) — do the same for
 * anything you add: a wrong id doesn't error, it silently renders nothing or
 * the wrong title (the exact trap AGENTS.md warns about for /discover params,
 * and it applies just as much here).
 *
 * WHY THIS IS A STANDALONE SCRIPT, NOT PART OF THE NEXT APP: it needs to run
 * outside a request — there's no user, no session, nothing to render. It's
 * deliberately self-contained (its own fetch calls, its own minimal media
 * upsert) rather than importing lib/tmdb/client.ts or lib/tmdb/upsert.ts:
 * those are TypeScript, use the `@/` path alias, and (upsert.ts) `import
 * "server-only"` — none of which plain `node` resolves without a bundler.
 * The tradeoff is real: the upsert logic below is a deliberate, minimal port
 * of `upsertMedia` in lib/tmdb/upsert.ts, not a shared import — if that
 * function's logic changes, check whether this needs the same change.
 */
import { createClient } from "@supabase/supabase-js";

const TMDB_TOKEN = process.env.TMDB_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env vars. Run with: node --env-file=.env scripts/seed-editorial-lists.mjs",
  );
  process.exit(1);
}

// Matches lib/discover/editorial.ts's EDITORIAL_ACCOUNT_ID exactly — the
// account created once via Supabase's admin API (see JOURNEY.md / this
// script's own git history for how). This script does NOT create that
// account; it only owns list/media content under it.
const EDITORIAL_ACCOUNT_ID = "aa1b126c-634a-47bb-a14b-e5edb1c9bb05";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Curated content ─────────────────────────────────────────────────────
//
// Franchises: a curated list of real TMDB collection ids. TMDB has no "all
// franchises" endpoint (DESIGN_ROADMAP.md), so this list IS the product —
// picks below are a defensible, diverse starter set (global blockbusters +
// one Indian franchise, matching the app's Bollywood-to-Busan-to-shonen
// identity), not a final editorial statement. Swap/add freely.

const FRANCHISES = [
  { slug: "franchise-avengers", name: "The Avengers", collectionId: 86311 },
  { slug: "franchise-harry-potter", name: "Harry Potter", collectionId: 1241 },
  { slug: "franchise-fast-furious", name: "Fast & Furious", collectionId: 9485 },
  { slug: "franchise-john-wick", name: "John Wick", collectionId: 404609 },
  { slug: "franchise-baahubali", name: "Bāhubali", collectionId: 350309 },
];

// Must-watches: pure editorial, no TMDB endpoint at all. One list, mixed
// movies + TV, deliberately spanning the catalogue this app is built for
// (Hollywood, Hindi, Telugu, Korean, Japanese, one TV pick) rather than
// defaulting to an English-language-only "best of" list.
const MUST_WATCH_LIST = {
  slug: "must-watch-picks",
  name: "Must-watches",
  description: "The ones you tell people to just trust you on.",
  items: [
    { tmdbId: 496243, type: "movie" }, // Parasite
    { tmdbId: 244786, type: "movie" }, // Whiplash
    { tmdbId: 155, type: "movie" }, // The Dark Knight
    { tmdbId: 20453, type: "movie" }, // 3 Idiots
    { tmdbId: 579974, type: "movie" }, // RRR
    { tmdbId: 129, type: "movie" }, // Spirited Away
    { tmdbId: 1396, type: "tv" }, // Breaking Bad
    { tmdbId: 1429, type: "tv" }, // Attack on Titan
  ],
};

// ─── TMDB (self-contained — see the file header for why) ────────────────

async function tmdbFetch(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

// ─── Minimal media upsert — a deliberate port of upsertMedia, see header ──

async function upsertMediaRow({
  tmdbId,
  type,
  title,
  overview,
  posterPath,
  backdropPath,
  releaseYear,
  runtimeMinutes,
  episodeCount,
  thin,
}) {
  const { data: existing } = await admin
    .from("media_external_ids")
    .select("media_id")
    .eq("source", "tmdb")
    .eq("external_id", String(tmdbId))
    .eq("media_type", type)
    .maybeSingle();

  if (existing?.media_id) {
    if (!thin) {
      await admin
        .from("media")
        .update({
          title,
          overview,
          poster_path: posterPath,
          backdrop_path: backdropPath,
          release_year: releaseYear,
          runtime_minutes: runtimeMinutes,
          episode_count: episodeCount,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.media_id);
    }
    return existing.media_id;
  }

  const { data: media, error: mediaErr } = await admin
    .from("media")
    .insert({
      type,
      title,
      overview,
      poster_path: posterPath,
      backdrop_path: backdropPath,
      release_year: releaseYear,
      runtime_minutes: runtimeMinutes,
      episode_count: episodeCount,
      last_synced_at: thin
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (mediaErr) throw new Error(`media insert failed: ${mediaErr.message}`);

  const { error: extErr } = await admin.from("media_external_ids").insert({
    media_id: media.id,
    source: "tmdb",
    external_id: String(tmdbId),
    media_type: type,
  });
  if (extErr) {
    await admin.from("media").delete().eq("id", media.id);
    throw new Error(`media_external_ids insert failed: ${extErr.message}`);
  }

  return media.id;
}

function yearFrom(dateStr) {
  if (!dateStr) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

// ─── List upsert (idempotent: replace items, don't append) ───────────────

async function upsertList({ slug, name, description }, mediaIds) {
  const { data: list, error: listErr } = await admin
    .from("custom_lists")
    .upsert(
      {
        user_id: EDITORIAL_ACCOUNT_ID,
        slug,
        name,
        description: description ?? null,
        is_public: true,
        is_ordered: true,
      },
      { onConflict: "user_id,slug" },
    )
    .select("id")
    .single();
  if (listErr) throw new Error(`custom_lists upsert failed (${slug}): ${listErr.message}`);

  // Replace, not append — re-running the script with a shorter/reordered
  // item list should leave the list matching the script, not accumulating.
  await admin.from("custom_list_items").delete().eq("list_id", list.id);

  const rows = mediaIds.map((mediaId, i) => ({
    list_id: list.id,
    media_id: mediaId,
    position: i,
  }));
  const { error: itemsErr } = await admin.from("custom_list_items").insert(rows);
  if (itemsErr) throw new Error(`custom_list_items insert failed (${slug}): ${itemsErr.message}`);

  console.log(`  ✓ ${slug}: ${rows.length} items`);
}

// ─── Seed ──────────────────────────────────────────────────────────────

async function seedFranchise(f) {
  console.log(`Franchise: ${f.name} (collection ${f.collectionId})`);
  const collection = await tmdbFetch(`/collection/${f.collectionId}`);
  const today = new Date().toISOString().slice(0, 10);

  // Skip unreleased parts (some collections list sequels years out) and
  // posterless parts (nothing to render).
  const parts = (collection.parts ?? [])
    .filter((p) => p.poster_path && p.release_date && p.release_date <= today)
    .sort((a, b) => (a.release_date < b.release_date ? -1 : 1));

  if (parts.length === 0) {
    console.warn(`  ! no released, poster-having parts for ${f.slug} — skipped`);
    return;
  }

  const mediaIds = [];
  for (const p of parts) {
    const id = await upsertMediaRow({
      tmdbId: p.id,
      type: "movie",
      title: p.title,
      overview: p.overview ?? null,
      posterPath: p.poster_path,
      backdropPath: p.backdrop_path ?? null,
      releaseYear: yearFrom(p.release_date),
      runtimeMinutes: null,
      episodeCount: null,
      thin: true, // Full detail fetched lazily on first real title-page visit.
    });
    mediaIds.push(id);
  }

  await upsertList(
    { slug: f.slug, name: f.name, description: collection.overview?.slice(0, 200) || null },
    mediaIds,
  );
}

async function seedMustWatches(list) {
  console.log(`Must-watches: ${list.items.length} picks`);
  const mediaIds = [];
  for (const item of list.items) {
    const details = await tmdbFetch(`/${item.type}/${item.tmdbId}`);
    const id = await upsertMediaRow({
      tmdbId: item.tmdbId,
      type: item.type,
      title: item.type === "movie" ? details.title : details.name,
      overview: details.overview ?? null,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path ?? null,
      releaseYear: yearFrom(
        item.type === "movie" ? details.release_date : details.first_air_date,
      ),
      runtimeMinutes:
        item.type === "movie"
          ? (details.runtime ?? null)
          : (details.episode_run_time?.[0] ?? null),
      episodeCount: item.type === "tv" ? (details.number_of_episodes ?? null) : null,
      thin: false, // Hand-picked and few — worth a full cache, not a thin one.
    });
    mediaIds.push(id);
  }
  await upsertList(list, mediaIds);
}

async function main() {
  for (const f of FRANCHISES) {
    await seedFranchise(f);
  }
  await seedMustWatches(MUST_WATCH_LIST);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
