"use client";

import { Bookmark, BookmarkCheck, Check, Eye } from "lucide-react";
import { useState, useTransition } from "react";
import type { TmdbMediaType } from "@/lib/tmdb/client";
import {
  quickToggleWatchedAction,
  quickToggleWatchlistAction,
} from "@/lib/tracking/quick-actions";

type Props = {
  tmdbId: number | string;
  tmdbType: TmdbMediaType;
  initiallyWatched?: boolean;
  initiallyWatchlisted?: boolean;
};

/**
 * Watched + Watchlist buttons layered over a poster. Sits as a sibling of the
 * PosterCard's <Link> — nesting buttons inside an anchor is invalid HTML and
 * every click would navigate instead of tracking.
 *
 * Revealed by `group-hover` / `group-focus-within` on the wrapper, so keyboard
 * users reach it by tabbing to the poster. Touch devices have no hover state;
 * the title page stays the path there.
 */
export function PosterQuickActions({
  tmdbId,
  tmdbType,
  initiallyWatched = false,
  initiallyWatchlisted = false,
}: Props) {
  const [watched, setWatched] = useState(initiallyWatched);
  const [watchlisted, setWatchlisted] = useState(initiallyWatchlisted);
  const [pending, startTransition] = useTransition();

  const toggleWatched = () => {
    const next = !watched;
    // Optimistic — mark-watched never waits on a round-trip. Marking something
    // watched also evicts it from the watchlist server-side, so predict that
    // here rather than letting the bookmark icon lag a beat behind.
    setWatched(next);
    if (next) setWatchlisted(false);
    startTransition(async () => {
      const result = await quickToggleWatchedAction({ tmdbId, tmdbType });
      // Roll back on failure so the poster never lies about what's tracked.
      if ("error" in result) {
        setWatched(!next);
        setWatchlisted(initiallyWatchlisted);
        return;
      }
      setWatched(result.watched);
      setWatchlisted(result.watchlisted);
    });
  };

  const toggleWatchlist = () => {
    // Finished titles can't be watchlisted — the two states are exclusive, and
    // the server refuses the write. Guard here too so the icon never flashes on
    // and snap back, which read as a bug.
    if (watched && !watchlisted) return;
    const next = !watchlisted;
    setWatchlisted(next);
    startTransition(async () => {
      const result = await quickToggleWatchlistAction({ tmdbId, tmdbType });
      if ("error" in result) {
        setWatchlisted(!next);
        return;
      }
      setWatched(result.watched);
      setWatchlisted(result.watchlisted);
    });
  };

  return (
    // The container stays pointer-events-none so the poster underneath is
    // still clickable; only the buttons themselves capture clicks.
    <div
      className="absolute inset-x-0 top-0 flex items-end justify-center gap-1 pb-2 opacity-0 group-hover/poster:opacity-100 group-focus-within/poster:opacity-100 transition-opacity duration-150 pointer-events-none"
      style={{
        aspectRatio: "2 / 3",
        borderRadius: "var(--radius-card)",
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.72))",
      }}
    >
      <QuickButton
        active={watched}
        pending={pending}
        onClick={toggleWatched}
        label={
          watched
            ? tmdbType === "tv"
              ? "Watched — mark as still watching"
              : "Watched — remove"
            : tmdbType === "tv"
              ? "Mark series watched"
              : "Mark watched"
        }
      >
        {watched ? (
          <Check className="w-4 h-4 animate-pop" />
        ) : (
          <Eye className="w-4 h-4" />
        )}
      </QuickButton>

      <QuickButton
        active={watchlisted}
        pending={pending}
        disabled={watched && !watchlisted}
        onClick={toggleWatchlist}
        label={
          watchlisted
            ? "Remove from watchlist"
            : watched
              ? "Already watched — un-mark it to add to your watchlist"
              : "Add to watchlist"
        }
      >
        {watchlisted ? (
          <BookmarkCheck className="w-4 h-4 animate-pop" />
        ) : (
          <Bookmark className="w-4 h-4" />
        )}
      </QuickButton>
    </div>
  );
}

function QuickButton({
  active,
  pending,
  disabled = false,
  onClick,
  label,
  children,
}: {
  active: boolean;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={label}
      // 8→9 so both buttons still fit a ~76px poster at the Small setting.
      className="pointer-events-auto grid place-items-center w-8 h-8 sm:w-9 sm:h-9 shrink-0 transition hover:brightness-125 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        borderRadius: "var(--radius-pill)",
        background: active ? "var(--accent)" : "rgba(255,255,255,0.16)",
        color: active ? "var(--accent-ink)" : "#fff",
        border: "1px solid rgba(255,255,255,0.28)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {children}
    </button>
  );
}
