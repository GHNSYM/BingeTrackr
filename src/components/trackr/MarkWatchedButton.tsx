"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  watched: boolean;
  pending: boolean;
  onToggle: () => void;
};

/**
 * Toggle button for a movie's watched state. **Controlled** — the parent owns
 * the state, because watched and watchlisted are mutually exclusive and both
 * buttons have to move together. When this held its own `useOptimistic`, marking
 * a movie watched left the watchlist button still reading "In watchlist" even
 * though the server had just evicted it.
 *
 * See `TitleTrackActions`, which owns the optimistic flip.
 */
export function MarkWatchedButton({ watched, pending, onToggle }: Props) {
  return (
    <Button
      onClick={onToggle}
      disabled={pending}
      variant={watched ? "outline" : "default"}
      className="min-w-[140px]"
      aria-pressed={watched}
    >
      {watched ? (
        <>
          <Check className="w-4 h-4 animate-pop" />
          Watched
        </>
      ) : (
        "Mark watched"
      )}
    </Button>
  );
}
