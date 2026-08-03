"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

type Props = {
  /** Target element's `id`, without the `#`. */
  targetId: string;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
};

/**
 * A same-page "jump to section" link that keeps working on repeat clicks.
 *
 * A plain `<a href="#why">` only animates the FIRST time: the browser's native
 * smooth-scroll-on-hash-change (`globals.css`'s `scroll-behavior: smooth`) fires
 * on a `hashchange` event, and clicking a link to the hash that's ALREADY the
 * current URL doesn't produce one — nothing changed, so nothing re-fires. Click
 * "Why this app" once and it works; click it again without navigating
 * elsewhere in between and it's a no-op, which is exactly the bug this fixes.
 *
 * Fix: scroll manually via `Element.scrollIntoView()` on every click, rather
 * than delegating to the browser's hash-driven behavior at all. That's
 * unconditional — it doesn't care whether the hash is already set — so it
 * fires every time.
 *
 * Still a real `<a href="#why">` underneath (via `next/link`), so right-click
 * "copy link", middle-click "open in new tab", and no-JS page loads all still
 * land on the section (once, natively, via the CSS rule) — this only takes
 * over the CLICK path, via `preventDefault`.
 */
export function ScrollToLink({ targetId, className, ariaLabel, children }: Props) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(targetId);
    // Target genuinely missing — let the native anchor jump be the fallback
    // rather than silently doing nothing.
    if (!el) return;

    e.preventDefault();

    // `scrollIntoView({behavior:'smooth'})` ignores the CSS `scroll-behavior`
    // media-query override entirely (it's a JS-level choice), so reduced-motion
    // has to be re-checked here or this regresses the accessibility fix already
    // made for the native path.
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

    // Keeps the URL shareable (pushState doesn't fire `hashchange` or trigger
    // any native scroll on its own, so this can't reintroduce the bug).
    if (history.pushState) {
      history.pushState(null, "", `#${targetId}`);
    }
  };

  return (
    <Link
      href={`#${targetId}`}
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
