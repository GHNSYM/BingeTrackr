import type { EditorialRow } from "@/lib/discover/editorial";
import { getAllTrackStates } from "@/lib/tracking/queries";
import { TrackablePosterGrid } from "./TrackablePosterGrid";

/**
 * Renders Discover's curated rows (Franchises, Must-watches) — the
 * custom_lists-backed half of Phase 2 (see `lib/discover/editorial.ts` for
 * why Mood isn't here: it rides `BrowseSection`/`discoverTitles` instead,
 * same as every Phase 1 axis).
 *
 * Deliberately NOT `BrowseSection`: that component fetches from TMDB
 * directly and is the wrong shape for data that's already been fetched
 * (editorial rows are cheap Supabase reads, done once by the caller and
 * passed in, not refetched per section) — an async server component per
 * franchise would mean 5 separate Suspense boundaries and 5 separate
 * `getAllTrackStates()` calls for what's fundamentally one query's result.
 *
 * `getAllTrackStates()` is `cache()`d (see its own doc comment), so calling
 * it here doesn't add a query if `BrowseSection` rows on the same page
 * already paid for it — same sharing the rest of Discover already relies on.
 */
export async function EditorialSection({ rows }: { rows: EditorialRow[] }) {
  if (rows.length === 0) return null;

  const trackStates = await getAllTrackStates();

  return (
    <>
      {rows.map((row) => (
        <section key={row.id} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            {row.name}
          </h2>
          <TrackablePosterGrid
            variant="rail"
            trackStates={trackStates}
            items={row.items}
          />
        </section>
      ))}
    </>
  );
}
