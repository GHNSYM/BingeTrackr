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
  /** Server-rendered controls that share the toolbar row (e.g. type pills). */
  toolbar?: React.ReactNode;
  /** Hide the toggle on views with no poster grid (e.g. Library → Watching). */
  showToggle?: boolean;
  children: React.ReactNode;
};

/**
 * Wraps a grid view with the poster-size toggle. Sets `data-poster-size` on a
 * container; globals.css turns that into a column count per breakpoint, so
 * switching sizes is one attribute write — no re-render of the poster list and
 * no server round-trip.
 */
export function PosterSizeShell({
  initial = DEFAULT_POSTER_SIZE,
  toolbar,
  showToggle = true,
  children,
}: Props) {
  const [size, setSize] = useState<PosterSize>(initial);

  const pick = (next: PosterSize) => {
    setSize(next);
    // So the server renders the right column count on the next visit.
    persistPosterSize(next);
  };

  return (
    <div data-poster-size={size} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toolbar}
        {showToggle && (
          <div
            role="group"
            aria-label="Poster size"
            className="flex gap-1 p-1 shrink-0"
            style={{
              background: "var(--secondary)",
              borderRadius: "var(--radius-pill)",
            }}
          >
            {POSTER_SIZE_OPTIONS.map((o) => {
              const isActive = size === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => pick(o.key)}
                  aria-pressed={isActive}
                  className="px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        )}
      </div>
      {children}
    </div>
  );
}
