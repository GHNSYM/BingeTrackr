import {
  PageHeadingSkeleton,
  PosterGridSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Browse blocks on a TMDB `/discover` call plus the genre list. Container
 * classes and the facet-row geometry mirror `browse/page.tsx` so the swap
 * doesn't reflow — the facet block is tall, and getting its height wrong would
 * shove the grid up the page exactly as the user starts scanning it.
 */
export default function Loading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton h={12} w={78} />
          <PageHeadingSkeleton w={280} />
        </div>

        {/* Type · Sort · Genre · Language · Streaming · Decade */}
        <div className="flex flex-col gap-3">
          {[2, 3, 10, 8, 8, 5].map((n, row) => (
            <div key={row} className="flex flex-wrap items-center gap-2">
              <span className="w-full sm:w-36 shrink-0">
                <Skeleton h={10} w={68} />
              </span>
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
        </div>

        {/* Poster-size toggle sits alone on this page — no type pills. */}
        <div className="flex justify-end">
          <Skeleton h={34} w={96} radius="999px" />
        </div>

        <PosterGridSkeleton count={20} />
      </div>
    </main>
  );
}
