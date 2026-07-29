import { PosterCard } from "./PosterCard";
import { PosterQuickActions } from "./PosterQuickActions";
import type { TmdbMediaType } from "@/lib/tmdb/client";
import type { QuickTrackState } from "@/lib/tracking/queries";
import { quickTrackKey } from "@/lib/tracking/queries";

export type TrackablePosterItem = {
  key: string;
  title: string;
  posterPath: string | null | undefined;
  year?: number | null;
  /** Omitted (or null) when we can't build a title-page link. */
  tmdbId?: number | string | null;
  tmdbType: TmdbMediaType;
  /** Extra line under the title — e.g. "Watched · 3 days ago". */
  meta?: string | null;
  /** Dim the card, for Library's "already watched" treatment. */
  dimmed?: boolean;
};

type Props = {
  items: TrackablePosterItem[];
  /**
   * Per-title tracking state keyed by `quickTrackKey(type, tmdbId)`. Omit to
   * render the grid without hover actions (e.g. for signed-out visitors).
   */
  trackStates?: Map<string, QuickTrackState>;
  /**
   * `grid` wraps and fills the container (Discover, Library, title-page recs).
   * `rail` is a single horizontally-scrolling row (Home's sections). Item
   * rendering is identical either way — only the container class changes.
   */
  variant?: "grid" | "rail";
};

/**
 * Shared poster layout. Column count / rail width both come from
 * `data-poster-size` on an ancestor (see PosterSizeShell + globals.css), so
 * every surface honours the same size preference and cards stay fluid.
 */
export function TrackablePosterGrid({
  items,
  trackStates,
  variant = "grid",
}: Props) {
  return (
    <div className={variant === "rail" ? "poster-rail" : "poster-grid"}>
      {items.map((item) => {
        const href =
          item.tmdbId != null
            ? `/title/${item.tmdbType}/${item.tmdbId}`
            : undefined;
        const state =
          trackStates && item.tmdbId != null
            ? trackStates.get(quickTrackKey(item.tmdbType, item.tmdbId))
            : undefined;

        return (
          <div
            key={item.key}
            className="relative group/poster flex flex-col gap-2"
            style={item.dimmed ? { opacity: 0.55 } : undefined}
          >
            <PosterCard
              title={item.title}
              posterPath={item.posterPath}
              year={item.year}
              href={href}
              size="md"
              fluid
            />
            {item.meta && (
              <p className="text-xs text-meta -mt-1">{item.meta}</p>
            )}
            {trackStates && item.tmdbId != null && (
              <PosterQuickActions
                tmdbId={item.tmdbId}
                tmdbType={item.tmdbType}
                initiallyWatched={state?.watched ?? false}
                initiallyWatchlisted={state?.watchlisted ?? false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
