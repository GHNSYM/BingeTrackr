"use client";

import { Check, CheckCheck } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import {
  markSeasonWatchedAction,
  unmarkSeasonWatchedAction,
} from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  seasonNumber: number;
  totalInSeason: number;
  watchedInSeason: number;
};

/**
 * "Mark all watched" / "Unmark all" toggle at the season header.
 * The button flips instantly; individual EpisodeRows will catch up when the
 * server action revalidates and re-hydrates their `initiallyWatched` prop.
 * Small (~200-500ms) lag between button and rows is acceptable — much
 * better than tapping every episode by hand across 12 seasons.
 */
export function SeasonMarkAllButton({
  mediaId,
  seasonNumber,
  totalInSeason,
  watchedInSeason,
}: Props) {
  const allWatched = watchedInSeason === totalInSeason && totalInSeason > 0;
  const someWatched = watchedInSeason > 0 && watchedInSeason < totalInSeason;

  const [optimisticAllWatched, setOptimistic] = useOptimistic(allWatched);
  const [pending, startTransition] = useTransition();

  if (totalInSeason === 0) return null;

  const toggle = () => {
    startTransition(async () => {
      const next = !optimisticAllWatched;
      setOptimistic(next);
      if (next) {
        await markSeasonWatchedAction({ mediaId, seasonNumber });
      } else {
        await unmarkSeasonWatchedAction({ mediaId, seasonNumber });
      }
    });
  };

  const label = optimisticAllWatched
    ? "Unmark season"
    : someWatched
      ? `Mark rest watched (${totalInSeason - watchedInSeason})`
      : "Mark season watched";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold hover:brightness-110 transition disabled:opacity-70"
      style={{
        background: optimisticAllWatched ? "var(--surface2)" : "var(--surface)",
        color: optimisticAllWatched ? "var(--foreground)" : "var(--body)",
        border: "1px solid var(--border)",
      }}
    >
      {optimisticAllWatched ? (
        <>
          <CheckCheck
            size={13}
            aria-hidden
            style={{ color: "var(--status-completed)" }}
          />
          {label}
        </>
      ) : (
        <>
          <Check size={13} aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}
