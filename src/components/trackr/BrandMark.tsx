import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Square edge length in px. The check scales to ~58% of it. */
  size?: number;
  className?: string;
};

/**
 * The logo mark: a white rounded square with the mark-watched check inside.
 *
 * The check is the design system's signature icon (see the handoff README's
 * icon section) — it's the gesture the whole app is built around, so it's the
 * logo. This replaces the placeholder "B" letter tile that stood in across the
 * auth funnel.
 *
 * Uses `--primary` / `--primary-foreground` rather than hardcoded white so the
 * mark inverts correctly in the light theme (dark ink square, white check).
 */
export function BrandMark({ size = 28, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid place-items-center shrink-0 bg-primary text-primary-foreground",
        className,
      )}
      style={{
        width: size,
        height: size,
        // Continuous-ish corner: ~29% of the box, matching the handoff's 8px
        // radius on a 28px tile.
        borderRadius: Math.round(size * 0.29),
      }}
    >
      <Check
        strokeWidth={2.6}
        style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58) }}
      />
    </span>
  );
}

/**
 * Mark + wordmark. `BingeTrackr` in display weight, with the same two-tone
 * treatment the handoff gives `Trackr.in` — the second half drops to `--meta`.
 */
export function BrandLockup({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <span
        className="font-display font-extrabold tracking-[-0.02em] leading-none"
        style={{ fontSize: Math.round(size * 0.64) }}
      >
        Binge<span className="text-meta font-semibold">Trackr</span>
      </span>
    </span>
  );
}
