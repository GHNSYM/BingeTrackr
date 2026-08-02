import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  discoverTitles,
  titleFromResult,
  yearFromResult,
  type DiscoverParams,
  type TmdbMediaSearchResult,
  type TmdbMediaType,
} from "@/lib/tmdb/client";
import { getAllTrackStates } from "@/lib/tracking/queries";
import { TrackablePosterGrid } from "./TrackablePosterGrid";

/**
 * The reusable browse section — half of the "one fetcher plus one component"
 * unlock in `DESIGN_ROADMAP.md`. Every Discover row is this component with a
 * different `DiscoverParams`; see `src/lib/discover/axes.ts` for the configs.
 *
 * It is an **async server component that fetches its own data**, which is the
 * point. Rendered inside a `<Suspense>` boundary, each row streams in the moment
 * its own TMDB call lands, so N rows cost the slowest one rather than the sum
 * and the page paints before any of them arrive. Hoisting the fetches into the
 * page would serialise them behind a single `await` and undo that.
 *
 * Tracking state comes from `getAllTrackStates()`, which is `cache()`d — the
 * first row to render pays for it and the rest are free, so the hover buttons
 * don't cost 4 Supabase queries per row.
 */

type Props = {
  label: string;
  type: TmdbMediaType;
  params: DiscoverParams;
  /** Renders a "See all →" link beside the label. */
  seeAllHref?: string;
  /**
   * `rail` (default) for the landing overview, `grid` for a drilled-into page.
   * `DESIGN_ROADMAP.md` fixes this convention: rails give a page of axes, grids
   * give the axis itself.
   */
  variant?: "rail" | "grid";
  /** Cap the row. A rail wants ~20; a grid wants everything fetched. */
  limit?: number;
  /** TMDB pages to pull (20 per page). */
  pages?: number;
};

export async function BrowseSection({
  label,
  type,
  params,
  seeAllHref,
  variant = "rail",
  limit,
  pages = 1,
}: Props) {
  const [results, trackStates] = await Promise.all([
    discoverTitles(type, params, pages),
    getAllTrackStates(),
  ]);

  // A row that came back empty is a mis-specified filter, not content — render
  // nothing rather than a labelled void. The grid page handles its own empty
  // state, where "no results" is a real answer to a user's query.
  if (results.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          {label}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-xs font-semibold text-meta hover:text-foreground transition inline-flex items-center gap-1 shrink-0"
          >
            See all
            <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </div>
      <TrackablePosterGrid
        variant={variant}
        trackStates={trackStates}
        items={toPosterItems(limit ? results.slice(0, limit) : results)}
      />
    </section>
  );
}

/** Shared by the section and by the browse grid page, which fetches its own. */
export function toPosterItems(results: TmdbMediaSearchResult[]) {
  return results.map((r) => ({
    key: `${r.media_type}-${r.id}`,
    title: titleFromResult(r),
    posterPath: r.poster_path,
    year: yearFromResult(r),
    tmdbId: r.id,
    tmdbType: r.media_type,
  }));
}
