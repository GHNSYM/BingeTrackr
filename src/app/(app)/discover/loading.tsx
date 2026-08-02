import {
  PageHeadingSkeleton,
  PosterSectionSkeleton,
  RailSectionSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Covers the gap before Discover's own Suspense boundaries take over.
 *
 * The page itself streams — trending, the browse chips, and each rail each have
 * their own fallback — so this only has to survive the page module's top-level
 * awaits (`searchParams` and the poster-size cookie). It still mirrors the full
 * layout rather than stopping at the heading, because handing off to *another*
 * skeleton of a different shape reads as a flicker.
 *
 * Shapes must track `discover/page.tsx`: trending is a grid, everything below it
 * is a rail.
 */
export default function Loading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <PageHeadingSkeleton w={200} />
          {/* Mobile-only search input */}
          <div className="md:hidden">
            <Skeleton h={44} w="100%" />
          </div>
        </div>

        {/* Toolbar: type pills + poster-size toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <Skeleton h={34} w={64} radius="999px" />
            <Skeleton h={34} w={84} radius="999px" />
            <Skeleton h={34} w={56} radius="999px" />
          </div>
          <Skeleton h={34} w={96} radius="999px" />
        </div>

        <div className="flex flex-col gap-10">
          <PosterSectionSkeleton count={20} labelWidth={210} />
          <PosterSectionSkeleton count={20} labelWidth={190} />

          {/* Browse-by chips: Genre / Language / Streaming / Decade */}
          <section className="flex flex-col gap-4">
            <Skeleton h={11} w={90} />
            {[10, 8, 8, 5].map((n, row) => (
              <div key={row} className="flex flex-col gap-2">
                <Skeleton h={10} w={70} />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: n }, (_, i) => (
                    <Skeleton
                      key={i}
                      h={28}
                      w={60 + ((i * 17) % 40)}
                      radius="999px"
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <RailSectionSkeleton count={8} labelWidth={150} />
          <RailSectionSkeleton count={8} labelWidth={170} />
          <RailSectionSkeleton count={8} labelWidth={200} />
        </div>
      </div>
    </main>
  );
}
