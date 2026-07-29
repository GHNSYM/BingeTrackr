"use client";

import { Star, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rateMediaAction, unrateMediaAction } from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  initialScore: number | null;
};

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * 1-10 rating picker.
 *
 * Deliberately NOT built on DropdownMenu. Two problems with that:
 *  - the trigger was `disabled` while the server action was in flight, and a
 *    menu whose trigger goes disabled mid-interaction closes and yanks focus —
 *    so the panel slammed shut the instant you picked a score;
 *  - the score readout was conditionally rendered, so hovering the scale
 *    changed the popup's height and the menu positioner re-anchored on every
 *    pointer move. That was the jitter.
 *
 * A plain anchored panel has no positioner to fight and no menu-item click
 * semantics in the way. It's also the correct role — a rating scale is a
 * radiogroup, not a menu.
 */
export function RateButton({ mediaId, initialScore }: Props) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or a click anywhere outside the trigger + panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const commitRating = (n: number) => {
    // Tap the same score to clear it.
    const next = n === score ? null : n;
    setScore(next);
    setHover(null);
    setOpen(false);
    startTransition(async () => {
      if (next === null) await unrateMediaAction(mediaId);
      else await rateMediaAction({ mediaId, score: next });
    });
  };

  const clear = () => {
    setScore(null);
    setHover(null);
    setOpen(false);
    startTransition(async () => {
      await unrateMediaAction(mediaId);
    });
  };

  const displayScore = hover ?? score;

  const panel = (
    <div className="flex flex-col gap-3">
      {/* Header height is fixed whether or not there's a score to show —
          a growing panel is what made this jitter before. */}
      <div className="flex items-baseline justify-between h-7">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          Your rating
        </p>
        <p className="text-lg font-bold tracking-tight leading-none">
          {displayScore ?? <span className="text-meta">–</span>}
          <span className="text-meta text-sm font-normal">/10</span>
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Your rating, 1 to 10"
        className="flex gap-1"
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const from = score ?? (e.key === "ArrowRight" ? 0 : 11);
          const next = e.key === "ArrowRight" ? from + 1 : from - 1;
          if (next >= 1 && next <= 10) commitRating(next);
        }}
      >
        {SCALE.map((n) => {
          const active = displayScore !== null && n <= displayScore;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`Rate ${n} out of 10`}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onClick={() => commitRating(n)}
              className="h-9 flex-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                background: active ? "var(--primary)" : "var(--surface2)",
                border: "1px solid var(--border)",
              }}
            />
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-meta">
        <span>Terrible</span>
        <span>Masterpiece</span>
      </div>

      {score !== null && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md py-2 hover:brightness-110 transition"
          style={{
            color: "var(--status-dropped)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <X size={12} />
          Remove rating
        </button>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="min-w-[100px]"
      >
        {score !== null ? (
          <>
            <Star className="w-4 h-4" fill="currentColor" strokeWidth={0} />
            {score}/10
          </>
        ) : (
          <>
            <Star className="w-4 h-4" />
            Rate
          </>
        )}
      </Button>

      {open && (
        <>
          {/* Mobile: bottom sheet. Desktop: panel anchored under the button. */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            // Above MobileTabBar (z-40), which is painted after page content.
            className="sm:hidden fixed inset-0 z-[55]"
            style={{ background: "var(--scrim)" }}
          />
          <div
            role="dialog"
            aria-label="Rate this title"
            className="sm:hidden fixed inset-x-0 bottom-0 z-[60] p-5 pb-8"
            style={{
              background: "var(--popover)",
              borderTop: "1px solid var(--border)",
              borderTopLeftRadius: "var(--radius-hero)",
              borderTopRightRadius: "var(--radius-hero)",
              boxShadow: "var(--shadow)",
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
            }}
          >
            {panel}
          </div>

          <div
            role="dialog"
            aria-label="Rate this title"
            className="hidden sm:block absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] p-4"
            style={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow)",
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
            }}
          >
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
