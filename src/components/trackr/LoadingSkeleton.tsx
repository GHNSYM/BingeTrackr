/**
 * Skeleton primitives. `AGENTS.md`: "No spinners. Skeleton screens for every
 * load." The `.skeleton` class in globals.css does the shimmer and already
 * drops the animation under `prefers-reduced-motion`, so nothing here needs a
 * motion guard of its own.
 *
 * All server-safe — no hooks, no client boundary. That matters because these
 * render inside `loading.tsx` and `<Suspense>` fallbacks, which should ship no
 * JavaScript at all.
 *
 * The point of every shape below is to occupy the SAME box the real content
 * will: a skeleton that reflows on swap is worse than no skeleton, because the
 * page appears to jump exactly when the user starts reading it.
 */

export function Skeleton({
  w,
  h,
  radius = "var(--radius-input)",
  className,
}: {
  w?: number | string;
  h?: number | string;
  radius?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{ width: w, height: h, borderRadius: radius }}
    />
  );
}

/** Stack of text lines. Last line is short, the way real prose wraps. */
export function SkeletonText({
  lines = 3,
  h = 14,
}: {
  lines?: number;
  h?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          h={h}
          w={i === lines - 1 ? "55%" : "100%"}
        />
      ))}
    </div>
  );
}

/** One poster card: 2:3 art plus its two label lines. */
export function PosterCardSkeleton({ label = true }: { label?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden
        className="skeleton w-full"
        style={{ aspectRatio: "2 / 3", borderRadius: "var(--radius-card)" }}
      />
      {label && (
        <div className="flex flex-col gap-1.5">
          <Skeleton h={12} w="85%" />
          <Skeleton h={10} w="40%" />
        </div>
      )}
    </div>
  );
}

/**
 * Mirrors `.poster-grid`, so the column count follows the same
 * `data-poster-size` variable the real grid reads and the swap is 1:1.
 */
export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid">
      {Array.from({ length: count }, (_, i) => (
        <PosterCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Horizontal rail, matching the fixed-width cards Home's rails use. */
export function PosterRailSkeleton({
  count = 6,
  cardWidth = 180,
}: {
  count?: number;
  cardWidth?: number;
}) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shrink-0 flex flex-col gap-2" style={{ width: cardWidth }}>
          <div
            aria-hidden
            className="skeleton"
            style={{
              width: cardWidth,
              height: Math.round(cardWidth * 1.5),
              borderRadius: "var(--radius-card)",
            }}
          />
          <Skeleton h={12} w="85%" />
          <Skeleton h={10} w="40%" />
        </div>
      ))}
    </div>
  );
}

/** The uppercase tracking-wide section label used across the app. */
export function SectionLabelSkeleton({ w = 140 }: { w?: number }) {
  return <Skeleton h={11} w={w} />;
}

/**
 * The `<h1>` + optional subtitle every authed page opens with. Height matches
 * `text-3xl sm:text-4xl font-extrabold` closely enough that the swap doesn't
 * nudge the content below it.
 */
export function PageHeadingSkeleton({
  w = 200,
  subtitle = false,
}: {
  w?: number;
  subtitle?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton h={34} w={w} />
      {subtitle && <Skeleton h={13} w={280} />}
    </div>
  );
}

/** A titled rail — label + horizontally scrolling cards. */
export function RailSectionSkeleton({
  count = 6,
  cardWidth = 180,
  labelWidth = 150,
}: {
  count?: number;
  cardWidth?: number;
  labelWidth?: number;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabelSkeleton w={labelWidth} />
      <PosterRailSkeleton count={count} cardWidth={cardWidth} />
    </section>
  );
}

/**
 * A titled section: label + grid. Used as the Suspense fallback wherever a
 * recommendation row streams in.
 */
export function PosterSectionSkeleton({
  count = 12,
  labelWidth = 140,
}: {
  count?: number;
  labelWidth?: number;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabelSkeleton w={labelWidth} />
      <PosterGridSkeleton count={count} />
    </section>
  );
}
