"use client";

import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import {
  markEpisodeWatchedAction,
  unmarkEpisodeAction,
} from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  runtimeMinutes: number | null;
  initiallyWatched: boolean;
};

/**
 * One episode. The ENTIRE row is the tap target — not a tiny checkbox —
 * per the design handoff. Optimistic toggle, satisfying check pop.
 */
export function EpisodeRow({
  mediaId,
  episodeId,
  seasonNumber,
  episodeNumber,
  title,
  runtimeMinutes,
  initiallyWatched,
}: Props) {
  const [watched, setWatched] = useOptimistic(initiallyWatched);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const next = !watched;
      setWatched(next);
      if (next) {
        await markEpisodeWatchedAction({
          mediaId,
          episodeId,
          seasonNumber,
          episodeNumber,
        });
      } else {
        await unmarkEpisodeAction({ mediaId, episodeId });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="w-full flex items-center gap-4 py-3 px-4 rounded-xl transition text-left hover:bg-secondary disabled:opacity-70"
      style={{
        borderRadius: "var(--radius-input)",
        color: watched ? "var(--meta)" : "var(--foreground)",
      }}
    >
      <span
        className="text-xs font-semibold tracking-wider w-10 shrink-0"
        style={{ color: "var(--meta)" }}
      >
        E{episodeNumber}
      </span>
      <span
        className="flex-1 text-sm font-medium truncate"
        style={{ textDecoration: watched ? "line-through" : "none" }}
      >
        {title ?? `Episode ${episodeNumber}`}
      </span>
      {runtimeMinutes ? (
        <span className="text-xs shrink-0" style={{ color: "var(--meta)" }}>
          {runtimeMinutes}m
        </span>
      ) : null}
      <span
        aria-hidden
        className="w-6 h-6 rounded-full grid place-items-center shrink-0 transition"
        style={{
          background: watched ? "var(--primary)" : "transparent",
          border: watched ? "none" : "1.5px solid var(--border)",
        }}
      >
        {watched && (
          <Check
            size={14}
            className="animate-pop"
            style={{ color: "var(--primary-foreground)" }}
          />
        )}
      </span>
      <span className="sr-only">
        {watched ? "Watched — tap to unmark" : "Not watched — tap to mark"}
      </span>
    </button>
  );
}
