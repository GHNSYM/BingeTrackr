"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleWatchlistAction } from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  initiallyInWatchlist: boolean;
};

export function WatchlistButton({ mediaId, initiallyInWatchlist }: Props) {
  const [inWatchlist, setOptimistic] = useOptimistic(initiallyInWatchlist);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      setOptimistic(!inWatchlist);
      await toggleWatchlistAction(mediaId);
    });
  };

  return (
    <Button
      onClick={toggle}
      disabled={pending}
      variant="outline"
      className="min-w-[140px]"
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
