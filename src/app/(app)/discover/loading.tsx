import {
  PageHeadingSkeleton,
  PosterSectionSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Discover blocks on TMDB trending (two pages per section), so without this the
 * tab looked unresponsive on a cold cache. Container classes mirror
 * `discover/page.tsx` exactly.
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
          <PosterSectionSkeleton count={12} labelWidth={210} />
          <PosterSectionSkeleton count={12} labelWidth={190} />
        </div>
      </div>
    </main>
  );
}
