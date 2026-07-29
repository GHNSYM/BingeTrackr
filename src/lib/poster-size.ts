/**
 * Poster-density preference for grid views (Discover today; Library next).
 *
 * Lives in a cookie rather than localStorage so the server renders the
 * correct column count on first paint — no flash of the default size. The
 * toggle also flips it client-side immediately, so the cookie is only ever
 * read for the *initial* render.
 *
 * Column counts per size live in globals.css under `[data-poster-size]`.
 */

export type PosterSize = "sm" | "md" | "lg";

export const POSTER_SIZE_COOKIE = "bt-poster-size";
export const DEFAULT_POSTER_SIZE: PosterSize = "md";

/** 1 year — a display preference, not session state. */
export const POSTER_SIZE_MAX_AGE = 60 * 60 * 24 * 365;

export const POSTER_SIZE_OPTIONS: { key: PosterSize; label: string }[] = [
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
];

/** Anything unrecognised (missing cookie, stale value) falls back to medium. */
export function parsePosterSize(value: string | null | undefined): PosterSize {
  return value === "sm" || value === "md" || value === "lg"
    ? value
    : DEFAULT_POSTER_SIZE;
}
