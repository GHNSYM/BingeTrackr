import {
  PageHeadingSkeleton,
  PosterGridSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/** Mirrors `library/page.tsx`: heading, tab badges, toolbar, grid. */
export default function Loading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <PageHeadingSkeleton w={170} />

      {/* Status tabs — Watching / Watched / Watchlist / Dropped */}
      <div className="flex gap-2 flex-wrap">
        {[104, 100, 108, 92].map((w, i) => (
          <Skeleton key={i} h={36} w={w} radius="999px" />
        ))}
      </div>

      <div className="flex items-center justify-end">
        <Skeleton h={34} w={96} radius="999px" />
      </div>

      <PosterGridSkeleton count={12} />
    </main>
  );
}
