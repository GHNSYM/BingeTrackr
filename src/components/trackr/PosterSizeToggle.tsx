"use client";

import { useState } from "react";
import {
  DEFAULT_POSTER_SIZE,
  POSTER_SIZE_COOKIE,
  POSTER_SIZE_MAX_AGE,
  POSTER_SIZE_OPTIONS,
  type PosterSize,
} from "@/lib/poster-size";

/**
 * Kept out of the component body — the React Compiler lint rules treat a
 * `document.cookie` write inside a component as mutating external state.
 */
function persistPosterSize(size: PosterSize) {
  document.cookie = `${POSTER_SIZE_COOKIE}=${size}; path=/; max-age=${POSTER_SIZE_MAX_AGE}; samesite=lax`;
}

type Props = {
  /** Read from the cookie server-side so first paint is already correct. */
  initial?: PosterSize;
  className?: string;
};

/**
 * The poster-size pill switcher, standalone.
 *
 * Lives in Settings now — Discover, Discover/browse and Library no longer
 * render their own copy (see `PosterSizeShell`, which used to own this markup
 * directly). One control, one cookie (`POSTER_SIZE_COOKIE`); every grid page
 * reads that same cookie server-side on its own next render, which is what
 * makes a change here "reflect in all the required pages" without any
 * cross-component wiring — each page was already reading shared state, it
 * just also used to redundantly offer its own way to change it.
 *
 * This component only writes the cookie; it does not attempt to live-update
 * any already-mounted grid on this same page (Settings has no poster grid of
 * its own), which is why there's no context/broadcast mechanism here — the
 * next navigation to a grid page does a fresh server read regardless, since
 * those routes are already dynamic.
 */
export function PosterSizeToggle({ initial = DEFAULT_POSTER_SIZE, className }: Props) {
  const [size, setSize] = useState<PosterSize>(initial);

  const pick = (next: PosterSize) => {
    setSize(next);
    persistPosterSize(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Poster size"
      className={`flex gap-1 p-1 shrink-0 ${className ?? ""}`}
      style={{ background: "var(--secondary)", borderRadius: "var(--radius-pill)" }}
    >
      {POSTER_SIZE_OPTIONS.map((o) => {
        const isActive = size === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => pick(o.key)}
            className="px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              borderRadius: "var(--radius-pill)",
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--accent-ink)" : "var(--body)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
