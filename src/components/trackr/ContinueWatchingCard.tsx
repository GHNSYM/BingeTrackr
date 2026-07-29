"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { posterUrl } from "@/lib/tmdb/client";
import { markEpisodeWatchedAction } from "@/lib/tracking/actions";
import type { ContinueWatchingItem } from "@/lib/tracking/queries";

type Props = { item: ContinueWatchingItem };

/**
 * The daily-driver card. Poster on the left, "next episode" on the right,
 * one-tap mark. The whole point of the app in one component.
 *
 * Sized to sit in the `.cw-rail` grid: fixed height, column width set by the
 * rail, every text line clamped to one line. It used to span a full row, which
 * meant three shows filled the whole home screen.
 */
export function ContinueWatchingCard({ item }: Props) {
  const [optimisticMarked, setMarked] = useOptimistic(false);
  const [pending, startTransition] = useTransition();

  const titleHref =
    item.tmdbId && item.tmdbType
      ? `/title/${item.tmdbType}/${item.tmdbId}${item.next ? `?s=${item.next.seasonNumber}` : ""}`
      : "#";

  const poster = posterUrl(item.posterPath, "w185");

  const pct =
    item.totalEpisodes > 0
      ? Math.min(100, Math.round((item.totalWatched / item.totalEpisodes) * 100))
      : 0;

  const markNext = () => {
    if (!item.next) return;
    startTransition(async () => {
      setMarked(true);
      await markEpisodeWatchedAction({
        mediaId: item.mediaId,
        episodeId: item.next!.episodeId,
        seasonNumber: item.next!.seasonNumber,
        episodeNumber: item.next!.episodeNumber,
      });
    });
  };

  return (
    <article
      className="glass flex gap-3 p-3 h-full"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Poster */}
      <Link
        href={titleHref}
        className="shrink-0 overflow-hidden block"
        style={{
          // Same 88×132 as before the rail redesign — card height is unchanged,
          // only its width shrank.
          width: 88,
          height: 132,
          borderRadius: "var(--radius-input)",
          boxShadow: "var(--poster-shadow)",
        }}
      >
        {poster ? (
          <Image
            src={poster}
            alt={item.title}
            width={88}
            height={132}
            className="object-cover w-full h-full"
          />
        ) : (
          <div
            className="w-full h-full grid place-items-center text-2xl font-extrabold"
            style={{ background: "var(--bg2)", color: "var(--meta)" }}
          >
            {item.title[0]}
          </div>
        )}
      </Link>

      {/* Content — min-w-0 is what lets the truncation actually kick in */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Link
            href={titleHref}
            className="text-sm font-bold leading-tight tracking-tight truncate hover:underline underline-offset-2"
            title={item.title}
          >
            {item.title}
          </Link>

          {item.next ? (
            <>
              <p className="text-xs font-semibold text-foreground truncate">
                Next · S{item.next.seasonNumber} E{item.next.episodeNumber}
              </p>
              {item.next.name && (
                <p
                  className="text-xs text-meta truncate"
                  title={item.next.name}
                >
                  {item.next.name}
                </p>
              )}
            </>
          ) : item.totalWatched < item.totalEpisodes ? (
            // No next episode resolved but they haven't finished — the upcoming
            // season isn't cached yet. Don't claim they're done.
            <p className="text-xs text-meta line-clamp-2">
              {item.totalWatched}/{item.totalEpisodes} watched · open to sync
            </p>
          ) : (
            <p className="text-xs text-meta truncate">All caught up ✓</p>
          )}
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          {/* Progress — cheap context, uses data the query already returns */}
          {item.totalEpisodes > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="h-1 flex-1 rounded-full overflow-hidden min-w-0"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full"
                  style={{ width: `${pct}%`, background: "var(--primary)" }}
                />
              </div>
              <span className="text-[10px] text-meta tabular-nums shrink-0">
                {item.totalWatched}/{item.totalEpisodes}
              </span>
            </div>
          )}

          {item.next && (
            <Button
              onClick={markNext}
              disabled={pending || optimisticMarked}
              size="sm"
              className="w-full h-7 text-xs px-2"
            >
              {optimisticMarked ? (
                <>
                  <Check className="w-3.5 h-3.5 animate-pop" />
                  Marked
                </>
              ) : (
                `Mark E${item.next.episodeNumber} watched`
              )}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
