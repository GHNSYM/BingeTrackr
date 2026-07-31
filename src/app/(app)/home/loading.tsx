import {
  RailSectionSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Home makes a TMDB trending call for the hero plus several of our own queries,
 * so it needs a shell too — this is the first thing a returning user sees.
 *
 * Layout follows `home/page.tsx`: a full-bleed hero outside the padded column,
 * then Continue Watching (the founding feature keeps the first section slot),
 * the stat strip, and the "your stuff" rails.
 */
export default function Loading() {
  return (
    <main className="flex-1 w-full flex flex-col gap-10 pb-10">
      {/* Hero — full-bleed. Flat surface rather than a shimmer; a block this
          large pulsing looks like an error state. Height approximates the
          coverflow's two-column desktop layout. */}
      <div
        className="w-full"
        style={{ background: "var(--bg2)", minHeight: 340 }}
      >
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-8 items-center">
          <div className="flex gap-3 justify-center shrink-0">
            <Skeleton w={90} h={135} radius="var(--radius-card)" />
            <Skeleton w={140} h={210} radius="var(--radius-card)" />
            <Skeleton w={90} h={135} radius="var(--radius-card)" />
          </div>
          <div className="flex flex-col gap-3 w-full max-w-sm">
            <Skeleton h={11} w={90} />
            <Skeleton h={30} w="80%" />
            <Skeleton h={13} w="100%" />
            <Skeleton h={13} w="65%" />
            <div className="flex gap-2 mt-2">
              <Skeleton h={38} w={104} />
              <Skeleton h={38} w={112} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 max-w-6xl mx-auto w-full flex flex-col gap-10">
        {/* Continue watching — wider cards than a poster rail. */}
        <RailSectionSkeleton count={4} cardWidth={260} labelWidth={160} />

        {/* Stat strip — one line. */}
        <Skeleton h={18} w={320} />

        <RailSectionSkeleton count={6} labelWidth={230} />
        <RailSectionSkeleton count={6} labelWidth={170} />
      </div>
    </main>
  );
}
