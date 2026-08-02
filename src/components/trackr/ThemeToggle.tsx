"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dark/light switch: a pill track with a gradient knob that slides across, and a
 * handwritten quip that drops underneath on every toggle.
 *
 * The theme *is* the `dark` class on `<html>`, matching the token setup in
 * `globals.css` (`:root` is light, `.dark` overrides it). The class is applied
 * before first paint by the inline script in the root layout; this component only
 * flips it and records the choice.
 *
 * Read via `useSyncExternalStore` rather than `useState` + `useEffect`, because
 * the DOM class is genuinely external state that the layout script writes before
 * React ever runs. That gets three things for free:
 *
 * - **No hydration mismatch.** `getServerSnapshot` returns `true`, which is
 *   always right: the server unconditionally emits `class="dark"`. React uses it
 *   for the hydration render, then reconciles against the live DOM.
 * - **No setState-in-effect**, which `react-hooks/set-state-in-effect` flags.
 * - **It tracks changes it didn't cause** — the MutationObserver means anything
 *   else flipping the class keeps this in sync.
 */

/** Module-level so the identity is stable and React doesn't resubscribe. */
function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

/** The server always renders dark — it's the design system's default. */
const getServerSnapshot = () => true;

/**
 * Going to light gets mocked; coming back to dark gets praised.
 *
 * Ordered as an escalation rather than shuffled, so someone who flips the switch
 * repeatedly — which is exactly what a gimmick like this invites — gets a running
 * bit instead of the same line twice. `Math.random()` would work here (it's in an
 * event handler, not render) but it can repeat, which kills the joke.
 *
 * Each list is walked with its OWN counter (see `counts`), so lengths don't have
 * to match and every line is reachable.
 */
const LIGHT_QUIPS = [
  "Aah… so you are the one.",
  "Bold. Your retinas have filed a complaint.",
  "Somewhere, a cinematographer just winced.",
  "Still here? Alright. Live your truth.",
  "Fine. It's your screen. Allegedly.",
] as const;

const DARK_QUIPS = [
  "Correct.",
  "Just like Nolan intended.",
  "Welcome back to the good side.",
  // Reworded from "like the theatre intended" so it doesn't echo the Nolan line
  // two entries above it — both would show up in one sitting.
  "Lights down, like a proper cinema hall.",
  "Impeccable taste, as established.",
  "This is how it's meant to be seen.",
] as const;

const QUIP_MS = 4200;

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // `id` forces a fresh element per toggle so the entry animation replays even
  // when the same line comes up twice in a row.
  const [quip, setQuip] = useState<{ id: number; text: string } | null>(null);

  /**
   * One cursor per direction, plus a monotonic id for the animation key.
   *
   * A single shared counter looked fine while both lists had 5 entries, but it
   * steps by 2 for anyone toggling back and forth — so it only ever lands on
   * indices of one parity. With an even-length list that makes half the lines
   * unreachable: at 6 dark quips, "Correct.", "Welcome back…" and "Impeccable
   * taste…" could never appear. Per-direction cursors walk each list in order,
   * so the escalation is real and the lists can be any length.
   */
  const counts = useRef({ dark: 0, light: 0 });
  const seq = useRef(0);

  // Auto-dismiss. setState lives in the timeout callback, not the effect body, so
  // this doesn't trip `react-hooks/set-state-in-effect`.
  useEffect(() => {
    if (!quip) return;
    const timer = setTimeout(() => setQuip(null), QUIP_MS);
    return () => clearTimeout(timer);
  }, [quip]);

  const toggle = () => {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    } catch {
      // Private mode / storage disabled. The toggle still works for this page
      // view, it just won't be remembered. Not worth surfacing.
    }

    const lines = nextIsDark ? DARK_QUIPS : LIGHT_QUIPS;
    const cursor = nextIsDark ? "dark" : "light";
    const n = counts.current[cursor]++;
    setQuip({ id: seq.current++, text: lines[n % lines.length] });
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={!isDark}
        /* No `title`: the native tooltip ("Switch to light/dark theme") was
           visible chrome the design doesn't want. `aria-label` stays — it isn't
           rendered, and without it this button has no accessible name at all,
           since its only content is two decorative icons. */
        aria-label="Toggle light and dark theme"
        className={cn(
          "glass-liquid relative shrink-0 rounded-full p-1 h-10 w-[68px] cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* Static rail icons. The knob slides over whichever one is active, so the
            inactive side stays legible underneath. `z-1` keeps them above the
            `.glass-liquid` sheen pseudo-element. */}
        <span
          aria-hidden
          className="absolute inset-0 z-1 flex items-center justify-between px-2.5 text-meta"
        >
          <Sun className="w-3.5 h-3.5" strokeWidth={2} />
          <Moon className="w-3.5 h-3.5" strokeWidth={2} />
        </span>

        <span
          aria-hidden
          className={cn(
            "grad-surface relative z-1 block w-8 h-8 rounded-full grid place-items-center",
            "shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "motion-reduce:transition-none",
            isDark ? "translate-x-[28px]" : "translate-x-0",
          )}
        >
          {isDark ? (
            <Moon className="w-4 h-4" strokeWidth={2.4} />
          ) : (
            <Sun className="w-4 h-4" strokeWidth={2.4} />
          )}
        </span>
      </button>

      {/* Right-aligned so it grows leftward from under the toggle and can't push
          the page into horizontal scroll on a narrow phone. `w-max` up to a cap
          lets a long line wrap rather than overflow. `aria-live` so the joke
          reaches screen-reader users too. */}
      <div
        aria-live="polite"
        className="absolute top-full right-0 mt-2 flex justify-end pointer-events-none"
      >
        {quip && (
          <p
            key={quip.id}
            className="toggle-quip w-max max-w-[min(62vw,17rem)] text-right text-lg sm:text-xl leading-tight text-foreground"
            style={{ textShadow: "0 1px 10px var(--bg)" }}
          >
            {quip.text}
          </p>
        )}
      </div>
    </div>
  );
}
