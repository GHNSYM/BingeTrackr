"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  inWatchlist: boolean;
  pending: boolean;
  onToggle: () => void;
  /** True when the title is finished — the two states are mutually exclusive. */
  blocked?: boolean;
};

/**
 * Watchlist toggle. **Controlled** — see `MarkWatchedButton` for why.
 *
 * `blocked` renders it disabled with an explanatory title rather than hiding it.
 * Hiding a control the user just saw is more confusing than showing why it's
 * unavailable, and the server refuses this write anyway.
 */
export function WatchlistButton({
  inWatchlist,
  pending,
  onToggle,
  blocked = false,
}: Props) {
  const disabled = pending || (blocked && !inWatchlist);

  return (
    <Button
      onClick={onToggle}
      disabled={disabled}
      variant="outline"
      className="min-w-[140px]"
      aria-pressed={inWatchlist}
      title={
        blocked && !inWatchlist
          ? "Already watched — un-mark it to add to your watchlist"
          : undefined
      }
    >
      {inWatchlist ? (
        <>
          <BookmarkCheck className="w-4 h-4 animate-pop" />
          In watchlist
        </>
      ) : (
        <>
          <Bookmark className="w-4 h-4" />
          Watchlist
        </>
      )}
    </Button>
  );
}
