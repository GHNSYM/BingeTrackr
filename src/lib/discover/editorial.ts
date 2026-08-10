import { createClient } from "@/lib/supabase/server";
import type { TrackablePosterItem } from "@/components/trackr/TrackablePosterGrid";

/**
 * Discover Phase 2's editorial content model — confirmed against the schema
 * before building anything bespoke, per `DESIGN_ROADMAP.md`: "custom_lists +
 * custom_list_items exist, with is_public and RLS that lets anyone read
 * public lists. An admin-owned account publishing curated public lists
 * powers all three rows with zero new schema."
 *
 * That's true for two of the three rows — Franchises and Must-watches, both
 * handled here. Mood is a different mechanism entirely (a genre+keyword combo
 * riding the existing `discoverTitles`/`BrowseSection` fetcher — see
 * `MOOD_AXES` in `axes.ts`) and doesn't touch this file or custom_lists at
 * all; the roadmap's own Mood paragraph says "it rides the Phase 1 fetcher",
 * which is a materially different (and much cheaper) plan than the
 * custom_lists content model the other two need.
 *
 * The editorial account (`aa1b126c-634a-47bb-a14b-e5edb1c9bb05`, handle
 * `bingetrackr`, created 2026-08-11) owns every curated list this file reads.
 * It's a real `auth.users` row — required, not a shortcut: `custom_lists.
 * user_id` is `not null references auth.users(id)`, so "an admin-owned
 * account" is the only structurally valid way to own admin-curated content
 * under this schema. It's never signed into; every write to its rows goes
 * through the service-role key in `scripts/seed-editorial-lists.mjs`, which
 * bypasses RLS entirely, so its password (generated once, never recorded) is
 * not a credential anyone needs.
 *
 * Not a secret: RLS already makes a public list readable by anyone regardless
 * of who owns it, so knowing this id grants no access it didn't already have.
 */
export const EDITORIAL_ACCOUNT_ID = "aa1b126c-634a-47bb-a14b-e5edb1c9bb05";

/**
 * Slug prefix convention, not a new `category` column. The roadmap's whole
 * selling point is *zero* new schema — a nullable column to distinguish
 * "franchise" from "must-watch" would work too, but costs a migration for
 * something a naming convention already solves for free. `custom_lists.slug`
 * is already unique per user, so `franchise-avengers` / `must-watch-picks` is
 * both the grouping key and a legible identifier.
 */
const PREFIX = {
  franchise: "franchise-",
  mustWatch: "must-watch-",
} as const;

export type EditorialRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  items: TrackablePosterItem[];
};

type ListRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

type ItemRow = {
  list_id: string;
  position: number | null;
  media: {
    id: string;
    title: string;
    poster_path: string | null;
    release_year: number | null;
    type: "movie" | "tv";
    tmdb_id: string | null;
  } | null;
};

/**
 * Shared by both editorial rows — only the slug prefix differs. Anonymous-safe
 * (no `getCurrentUser()` call): these are `is_public` lists by construction,
 * meant to render on Discover for every visitor, signed in or not.
 */
async function getEditorialRowsByPrefix(prefix: string): Promise<EditorialRow[]> {
  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("custom_lists")
    .select("id, slug, name, description")
    .eq("user_id", EDITORIAL_ACCOUNT_ID)
    .eq("is_public", true)
    .like("slug", `${prefix}%`)
    // Seed order is display order — see the seed script's array order.
    .order("created_at", { ascending: true })
    .overrideTypes<ListRow[]>();

  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);

  const { data: items } = await supabase
    .from("custom_list_items")
    .select(
      `list_id, position,
       media:media_id ( id, title, poster_path, release_year, type, tmdb_id )`,
    )
    .in("list_id", listIds)
    .order("list_id", { ascending: true })
    .order("position", { ascending: true })
    .overrideTypes<ItemRow[]>();

  const itemsByList = new Map<string, TrackablePosterItem[]>();
  for (const it of items ?? []) {
    if (!it.media) continue; // A media row was deleted out from under a list item; skip rather than crash.
    const list = itemsByList.get(it.list_id) ?? [];
    list.push({
      key: it.media.id,
      title: it.media.title,
      posterPath: it.media.poster_path,
      year: it.media.release_year,
      tmdbId: it.media.tmdb_id,
      tmdbType: it.media.type,
    });
    itemsByList.set(it.list_id, list);
  }

  return lists
    .map((list) => ({
      id: list.id,
      slug: list.slug,
      name: list.name,
      description: list.description,
      items: itemsByList.get(list.id) ?? [],
    }))
    .filter((row) => row.items.length > 0); // An empty curated list is a data bug, not content.
}

export function getFranchiseRows(): Promise<EditorialRow[]> {
  return getEditorialRowsByPrefix(PREFIX.franchise);
}

export function getMustWatchRows(): Promise<EditorialRow[]> {
  return getEditorialRowsByPrefix(PREFIX.mustWatch);
}
