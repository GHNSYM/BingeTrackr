"use client";

import { useState, useTransition } from "react";
import { MarkWatchedButton } from "@/components/trackr/MarkWatchedButton";
import { WatchlistButton } from "@/components/trackr/WatchlistButton";
import type { TmdbMediaType } from "@/lib/tmdb/client";
import {
  markMovieWatchedAction,
  toggleWatchlistAction,
  unmarkMovieWatchedAction,
} from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  type: TmdbMediaType;
  /** Movie only — a series' watched state is owned by the episode widget. */
  initiallyWatched: boolean;
  initiallyInWatchlist: boolean;
  /** Series only: status === "completed". */
  seriesCompleted?: boolean;
};

/**
 * The title page's action row. Owns the shared state for Watched + Watchlist,
 * because those two are mutually exclusive and must move together.
 *
 * Previously each button held its own `useOptimistic`, so they couldn't see each
 * other: marking a movie watched evicted it from the watchlist server-side while
 * the watchlist button carried on showing "In watchlist" until a full reload.
 * The same split let both be switched on at once, which is the state the Library
 * then refused to display.
 *
 * Rules encoded here, matching the server:
 *   - Marking watched clears the watchlist (the server's `dropFromWatchlist`).
 *   - A finished title cannot be added to the watchlist at all. For a series,
 *     "finished" means Completed — a half-watched show legitimately stays on the
 *     watchlist, so `seriesCompleted` is what blocks it, not "has any progress".
 */
export function TitleTrackActions({
  mediaId,
  type,
  initiallyWatched,
  initiallyInWatchlist,
  seriesCompleted = false,
}: Props) {
  const [watched, setWatched] = useState(initiallyWatched);
  const [inWatchlist, setInWatchlist] = useState(initiallyInWatchlist);
  const [pending, startTransition] = useTransition();

  const finished = type === "movie" ? watched : seriesCompleted;

  const toggleWatched = () => {
    const next = !watched;
    // Optimistic, and predict the eviction rather than letting the watchlist
    // button lag a round-trip behind.
    setWatched(next);
    if (next) setInWatchlist(false);
    startTransition(async () => {
      const result = next
        ? await markMovieWatchedAction(mediaId)
        : await unmarkMovieWatchedAction(mediaId);
      if ("error" in result) {
        setWatched(!next);
        setInWatchlist(initiallyInWatchlist);
      }
    });
  };

  const toggleWatchlist = () => {
    if (finished && !inWatchlist) return; // server refuses this too
    const next = !inWatchlist;
    setInWatchlist(next);
    startTransition(async () => {
      const result = await toggleWatchlistAction(mediaId);
      if ("error" in result) setInWatchlist(!next);
    });
  };

  return (
    <>
      {type === "movie" && (
        <MarkWatchedButton
          watched={watched}
          pending={pending}
          onToggle={toggleWatched}
        />
      )}
      <WatchlistButton
        inWatchlist={inWatchlist}
        pending={pending}
        onToggle={toggleWatchlist}
        blocked={finished}
      />
    </>
  );
}
