import { cn } from "@/lib/utils";

/**
 * Hand-drawn marker annotations — the landing page's only illustration.
 *
 * Inline SVG, so no request and no icon-font dependency. Every path is a single
 * wobbly stroke using `currentColor`, so it inherits the surrounding text
 * colour and works in both themes.
 *
 * `pathLength="1"` normalises each path's length to 1 regardless of its real
 * geometry, which lets one `stroke-dashoffset: 1 → 0` keyframe draw ANY of
 * these variants on scroll (`.scribble-path` in globals.css). Without it every
 * variant would need its own dasharray measured by hand.
 *
 * `preserveAspectRatio="none"` is what makes an underline stretch to the width
 * of whatever word it's under instead of staying a fixed size.
 */

type Variant = "underline" | "double" | "circle" | "strike" | "arrow";

type Spec = {
  d: string[];
  viewBox: string;
  stroke: number;
  /**
   * Underlines must stretch to the width of the word they sit under, so they use
   * `none`. The arrow must NOT: non-uniform scaling skews its barb angles away
   * from the stem direction and the head stops reading as attached.
   */
  preserve: "none" | "xMidYMid meet";
};

const PATHS: Record<Variant, Spec> = {
  // A single marker swipe that overshoots on the right, the way a real one does.
  underline: {
    viewBox: "0 0 300 16",
    stroke: 4,
    preserve: "none",
    d: ["M4 11C58 4 121 13 178 6C221 1 262 10 296 5"],
  },
  // Two passes — the second shorter and offset, as if gone over twice.
  double: {
    viewBox: "0 0 300 20",
    stroke: 3.6,
    preserve: "none",
    d: [
      "M4 9C58 3 121 12 178 5C221 1 262 9 296 4",
      "M22 16C74 12 138 18 190 13C226 10 258 16 284 13",
    ],
  },
  // An oval scrawled around a word, not quite closing.
  circle: {
    viewBox: "0 0 300 90",
    stroke: 3.4,
    preserve: "none",
    d: [
      "M154 6C96 3 24 14 11 41C0 66 60 84 152 85C232 86 291 70 293 43C295 19 244 6 176 5",
    ],
  },
  strike: {
    viewBox: "0 0 300 14",
    stroke: 3.6,
    preserve: "none",
    d: ["M4 9C60 5 120 8 180 5C224 3 262 7 296 4"],
  },
  /**
   * A hand-drawn arrow curving down-right, for pointing at a CTA.
   *
   * The barbs are derived from the stem, not eyeballed. The curve arrives at the
   * tip (74,72) from its last control point (34,62), so the incoming direction is
   * ~(40,10); the barbs are that vector reversed and rotated ±25°, giving
   * (60,61) and (56,76). The previous values put one barb at (66,52) — nearly
   * straight up, ~70° off the stem — which is why the head looked detached from
   * the line rather than joined to it.
   */
  arrow: {
    viewBox: "0 0 120 90",
    stroke: 3.4,
    preserve: "xMidYMid meet",
    d: ["M12 8C16 38 34 62 74 72", "M74 72L60 61", "M74 72L56 76"],
  },
};

type Props = {
  variant?: Variant;
  className?: string;
  /** Opacity of the stroke. Marker ink is never fully opaque. */
  opacity?: number;
  /**
   * Draw earlier in the element's scroll journey. Needed near the bottom of the
   * page, where the default range can still be mid-draw when scrolling runs out.
   */
  early?: boolean;
};

export function Scribble({
  variant = "underline",
  className,
  opacity = 0.85,
  early = false,
}: Props) {
  const { d, viewBox, stroke, preserve } = PATHS[variant];

  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      preserveAspectRatio={preserve}
      fill="none"
      className={cn(
        "pointer-events-none overflow-visible",
        early && "scribble-early",
        className,
      )}
      style={{ opacity }}
    >
      {d.map((path, i) => (
        <path
          key={i}
          className="scribble-path"
          d={path}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/**
 * A word (or phrase) with a scribble under it.
 *
 * The SVG is absolutely positioned so it can't affect line height — an inline
 * SVG in the text flow would push the line box down and break the leading of a
 * multi-line paragraph. `-bottom-*` lets it sit slightly below the baseline the
 * way a real underline does.
 */
export function Underlined({
  children,
  variant = "underline",
  className,
  svgClassName,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  svgClassName?: string;
}) {
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      <Scribble
        variant={variant}
        className={cn(
          "absolute left-0 w-full",
          variant === "circle"
            ? "-inset-x-3 -top-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)]"
            : "-bottom-1.5 h-2.5 sm:h-3",
          svgClassName,
        )}
      />
    </span>
  );
}
