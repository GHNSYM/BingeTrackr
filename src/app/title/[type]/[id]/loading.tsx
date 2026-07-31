import {
  PosterSectionSkeleton,
  Skeleton,
  SkeletonText,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Instant shell for the title page.
 *
 * Next wraps this route segment in a Suspense boundary, so a click on a poster
 * paints this immediately instead of leaving the user on the previous page while
 * the server does 3-6 TMDB round-trips. That wait was the whole complaint: the
 * navigation felt broken because nothing acknowledged the click.
 *
 * Geometry is copied from `page.tsx` rather than approximated — the 42vh/280px
 * backdrop, the `-mt-40 sm:-mt-32` pull-up, the 180x270 poster, the max-w-5xl
 * container. If you change the hero there, change it here, or the page will
 * visibly jump as it swaps.
 */
export default function Loading() {
  return (
    <main className="flex-1 flex flex-col">
      <section className="relative">
        {/* Backdrop. Flat surface, not a shimmer — a 42vh shimmering block reads
            as a broken image rather than as loading. */}
        <div
          className="relative h-[42vh] min-h-[280px] w-full overflow-hidden"
          style={{ background: "var(--bg2)" }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.55) 60%, var(--bg) 100%)",
            }}
          />
        </div>

        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 -mt-40 sm:-mt-32 relative z-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div
              aria-hidden
              className="skeleton shrink-0"
              style={{
                width: 180,
                height: 270,
                borderRadius: "var(--radius-hero)",
              }}
            />

            <div className="flex flex-col gap-3 pt-2 w-full max-w-md">
              {/* "MOVIE · 1999 · 139m" */}
              <Skeleton h={11} w={150} />
              {/* Title — two lines, because long titles wrap at this size. */}
              <div className="flex flex-col gap-2">
                <Skeleton h={38} w="90%" />
                <Skeleton h={38} w="55%" />
              </div>
              {/* Rating row */}
              <Skeleton h={14} w={110} />
            </div>
          </div>

          {/* Action row — three pills: Mark watched / Watchlist / Rate. */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Skeleton h={40} w={132} radius="var(--radius-input)" />
            <Skeleton h={40} w={116} radius="var(--radius-input)" />
            <Skeleton h={40} w={96} radius="var(--radius-input)" />
          </div>

          {/* Overview */}
          <section className="mt-8 max-w-3xl flex flex-col gap-3">
            <Skeleton h={11} w={90} />
            <SkeletonText lines={3} />
          </section>

          {/* One recommendation section. Deliberately one, not three: guessing
              high and collapsing looks worse than filling in. */}
          <div className="mt-10">
            <PosterSectionSkeleton count={6} labelWidth={120} />
          </div>

          <div className="h-16" />
        </div>
      </section>
    </main>
  );
}
