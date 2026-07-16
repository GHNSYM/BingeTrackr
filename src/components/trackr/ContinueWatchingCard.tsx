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
 */
export function ContinueWatchingCard({ item }: Props) {
  const [optimisticMarked, setMarked] = useOptimistic(false);
  const [pending, startTransition] = useTransition();

  const titleHref =
    item.tmdbId && item.tmdbType
      ? `/title/${item.tmdbType}/${item.tmdbId}${item.next ? `?s=${item.next.seasonNumber}` : ""}`
      : "#";

  const poster = posterUrl(item.posterPath, "w342");

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
      className="glass flex gap-4 p-3 sm:p-4"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Poster */}
      <Link
        href={titleHref}
        className="shrink-0 overflow-hidden block"
        style={{
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
            className="w-full h-full grid place-items-center text-3xl font-extrabold"
            style={{ background: "var(--bg2)", color: "var(--meta)" }}
          >
            {item.title[0]}
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <Link
            href={titleHref}
            className="text-lg font-bold leading-tight tracking-tight hover:underline underline-offset-2 line-clamp-2"
          >
            {item.title}
          </Link>
          {item.currentSeason && item.currentEpisode ? (
            <p className="text-xs text-meta">
              Last watched · S{item.currentSeason} E{item.currentEpisode}
            </p>
          ) : (
            <p className="text-xs text-meta">Not started yet</p>
          )}
          {item.next ? (
            <p className="text-sm text-body mt-1 line-clamp-1">
              <span className="text-foreground font-semibold">
                Next: S{item.next.seasonNumber} E{item.next.episodeNumber}
              </span>
              {item.next.name && ` — ${item.next.name}`}
            </p>
          ) : (
            <p className="text-sm text-body mt-1">
              You&apos;re all caught up ✓
            </p>
          )}
        </div>

        {item.next && (
          <Button
            onClick={markNext}
            disabled={pending || optimisticMarked}
            size="sm"
            className="w-fit"
          >
            {optimisticMarked ? (
              <>
                <Check className="w-4 h-4 animate-pop" />
                Marked
              </>
            ) : (
              `Mark E${item.next.episodeNumber} watched`
            )}
          </Button>
        )}
      </div>
    </article>
  );
}
