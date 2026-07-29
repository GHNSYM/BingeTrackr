"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { posterUrl } from "@/lib/tmdb/client";
import type { TmdbMediaType } from "@/lib/tmdb/client";
import { quickToggleWatchlistAction } from "@/lib/tracking/quick-actions";

export type HeroItem = {
  tmdbId: number;
  tmdbType: TmdbMediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  inWatchlist: boolean;
};

type Props = { items: HeroItem[] };

/** Dwell time per slide. */
const AUTO_ADVANCE_MS = 4000;

/**
 * How many cards either side of centre stay mounted. Cards at |offset| === 2
 * are invisible but rendered, so they already exist (and their images are
 * loaded) before sliding into view — mounting a card at its final transform
 * would snap instead of animate.
 */
const WINDOW = 2;

/**
 * Home's hero — the coverflow stack from the design handoff.
 *
 * Layout: stacked on mobile (stack, then centred details), two columns from
 * `lg` up (stack left, details right) so the hero costs ~150px less vertical
 * space and Continue Watching sits higher.
 *
 * Motion note: every card keeps a STABLE key and a stable wrapper element for
 * its whole life in the window. An earlier version keyed cards by their
 * position, so a card moving from side to centre changed key and element type,
 * remounted, and jumped straight to its new transform with no animation. Only
 * the inline style may change between renders — that's what CSS transitions
 * need in order to interpolate.
 */
export function HeroCarousel({ items }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  // Watchlist state lives here so it survives slide changes.
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();

  const count = items.length;
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;

  /**
   * Auto-advance. `safeIndex` is a dependency on purpose: every change — manual
   * or automatic — restarts the timer, so a slide always gets its full dwell
   * time and tapping an arrow doesn't get overridden a moment later.
   *
   * setState happens inside the interval callback, never in the effect body.
   */
  useEffect(() => {
    if (paused || count <= 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = setInterval(() => setIndex((i) => i + 1), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, count, safeIndex]);

  if (count === 0) return null;

  const current = items[safeIndex];
  const key = `${current.tmdbType}-${current.tmdbId}`;
  const inWatchlist = added[key] ?? current.inWatchlist;

  const go = (delta: number) => setIndex(safeIndex + delta);

  const toggleWatchlist = () => {
    const next = !inWatchlist;
    setAdded((prev) => ({ ...prev, [key]: next }));
    startTransition(async () => {
      const result = await quickToggleWatchlistAction({
        tmdbId: current.tmdbId,
        tmdbType: current.tmdbType,
      });
      setAdded((prev) => ({
        ...prev,
        [key]: "error" in result ? !next : result.watchlisted,
      }));
    });
  };

  /**
   * Signed distance from centre, wrapped so the shortest way round wins —
   * otherwise advancing past the end would sling cards across the whole rail.
   */
  const slides = items
    .map((item, i) => {
      let offset = i - safeIndex;
      if (offset > count / 2) offset -= count;
      if (offset < -count / 2) offset += count;
      return { item, offset };
    })
    .filter((s) => Math.abs(s.offset) <= WINDOW);

  const href = `/title/${current.tmdbType}/${current.tmdbId}`;

  return (
    <section
      aria-label="Trending now"
      aria-roledescription="carousel"
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/*
        Colour wash. One layer per windowed card, crossfading on opacity — a
        single swapped <img> would hard-cut. The URLs are the SAME w342 posters
        the stack renders, so these are cache hits and cost no extra download.
        Sampled from poster art, which keeps the monochrome-chrome rule intact.
      */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {slides.map(({ item, offset }) => {
          const wash = posterUrl(item.posterPath, "w342");
          if (!wash) return null;
          return (
            <div
              key={`w-${item.tmdbType}-${item.tmdbId}`}
              className="hero-wash absolute inset-0"
              style={{ opacity: offset === 0 ? 0.55 : 0 }}
            >
              <Image
                src={wash}
                alt=""
                fill
                sizes="(min-width: 640px) 224px, 196px"
                priority={offset === 0}
                className="object-cover"
                style={{
                  filter: "blur(46px) saturate(1.4)",
                  transform: "scale(1.7)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.18), var(--bg) 94%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto w-full">
        {/* Stacked on mobile, side-by-side from lg up. */}
        <div className="pt-5 sm:pt-7 lg:flex lg:items-center lg:gap-8 xl:gap-10 lg:px-6">
          {/* Coverflow stack */}
          <div
            className="hero-stack relative flex items-center justify-center"
            onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              if (touchX === null) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
              setTouchX(null);
            }}
          >
            {slides.map(({ item, offset }) => {
              const isCentre = offset === 0;
              const distance = Math.abs(offset);
              const poster = posterUrl(item.posterPath, "w342");

              const inner = (
                <>
                  {poster ? (
                    <Image
                      src={poster}
                      alt={item.title}
                      fill
                      sizes="(min-width: 640px) 224px, 196px"
                      priority={isCentre}
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full grid place-items-center text-6xl font-extrabold"
                      style={{
                        background: "var(--bg2)",
                        color: "rgba(255,255,255,0.16)",
                      }}
                    >
                      {item.title[0]}
                    </div>
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[24px]"
                    style={{
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
                    }}
                  />
                </>
              );

              return (
                // STABLE key + stable element — only `style` changes as the
                // card moves, which is what lets the transition interpolate.
                <div
                  key={`${item.tmdbType}-${item.tmdbId}`}
                  className="hero-card absolute overflow-hidden"
                  style={{
                    width: "var(--hero-w)",
                    height: "var(--hero-h)",
                    transform: `translateX(${offset * 62}%) scale(${
                      distance === 0 ? 1 : distance === 1 ? 0.84 : 0.72
                    })`,
                    opacity: distance === 0 ? 1 : distance === 1 ? 0.5 : 0,
                    filter: isCentre ? "none" : "saturate(0.7)",
                    zIndex: 3 - distance,
                    boxShadow: isCentre
                      ? "var(--shadow)"
                      : "var(--poster-shadow)",
                    // Cards beyond the visible flanks must not eat clicks.
                    pointerEvents: distance >= WINDOW ? "none" : undefined,
                  }}
                >
                  {isCentre ? (
                    <Link
                      href={href}
                      className="block w-full h-full"
                      aria-label={item.title}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go(offset)}
                      aria-label={`Show ${item.title}`}
                      className="block w-full h-full"
                      tabIndex={distance >= WINDOW ? -1 : undefined}
                    >
                      {inner}
                    </button>
                  )}
                </div>
              );
            })}

            {count > 1 && (
              <>
                <HeroArrow side="left" onClick={() => go(-1)} />
                <HeroArrow side="right" onClick={() => go(1)} />
              </>
            )}
          </div>

          {/* Details — centred under the stack on mobile, beside it on desktop */}
          <div className="text-center px-6 pt-2 pb-4 lg:flex-1 lg:min-w-0 lg:text-left lg:px-0 lg:pb-0">
            {/* Names the rail. Without it the stack is just three posters with
                no stated reason for being there. Same eyebrow treatment as the
                section headings further down Home, and it doubles as the route
                into Discover. */}
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.15em] uppercase text-meta hover:text-foreground transition"
            >
              Trending in India
              <ArrowRight size={12} aria-hidden />
            </Link>
            <p className="text-[13px] font-semibold text-meta mt-2">
              {current.tmdbType === "movie" ? "Movie" : "TV series"}
              {current.year ? ` · ${current.year}` : ""}
            </p>
            <h2 className="text-2xl sm:text-[27px] lg:text-3xl xl:text-4xl font-extrabold tracking-tight mt-1 line-clamp-2 lg:line-clamp-3">
              {current.title}
            </h2>

            <div className="flex gap-2 justify-center lg:justify-start mt-4">
              <Link
                href={href}
                className="px-5 py-2.5 text-[13px] font-bold transition hover:brightness-110"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  borderRadius: 13,
                }}
              >
                Details
              </Link>
              <button
                type="button"
                onClick={toggleWatchlist}
                disabled={pending}
                aria-pressed={inWatchlist}
                className="glass inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold transition hover:brightness-125 disabled:opacity-60"
                style={{ borderRadius: 13 }}
              >
                {inWatchlist ? (
                  <>
                    <BookmarkCheck size={14} className="animate-pop" />
                    In watchlist
                  </>
                ) : (
                  <>
                    <Bookmark size={14} />
                    Watchlist
                  </>
                )}
              </button>
            </div>

            {/* Dots */}
            {count > 1 && (
              <div className="flex gap-1.5 justify-center lg:justify-start mt-5 flex-wrap">
                {items.map((item, i) => (
                  <button
                    key={`${item.tmdbType}-${item.tmdbId}`}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to ${item.title}`}
                    aria-current={i === safeIndex}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === safeIndex ? 18 : 6,
                      background:
                        i === safeIndex ? "var(--accent)" : "var(--border)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className="hidden sm:grid place-items-center absolute z-10 w-9 h-9 glass hover:brightness-125 transition"
      style={{
        [side]: 8,
        borderRadius: "var(--radius-pill)",
        color: "var(--text)",
      }}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
