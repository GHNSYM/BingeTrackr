"use client";

import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  markMovieWatchedAction,
  unmarkMovieWatchedAction,
} from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  initiallyWatched: boolean;
};

/**
 * Toggle button for a movie's watched state. Uses useOptimistic so the flip
 * is instant — the server action races the UI, and the paint-time flicker
 * that would normally accompany a round-trip is gone.
 */
export function MarkWatchedButton({ mediaId, initiallyWatched }: Props) {
  const [optimisticWatched, setOptimisticWatched] =
    useOptimistic(initiallyWatched);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const next = !optimisticWatched;
      setOptimisticWatched(next);
      if (next) {
        await markMovieWatchedAction(mediaId);
      } else {
        await unmarkMovieWatchedAction(mediaId);
      }
    });
  };

  return (
    <Button
      onClick={toggle}
      disabled={pending}
      variant={optimisticWatched ? "outline" : "default"}
      className="min-w-[140px]"
    >
      {optimisticWatched ? (
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
