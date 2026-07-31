import {
  PosterGridSkeleton,
  SectionLabelSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Public profile shell. This one matters beyond feel: it's the link people share,
 * so it's often opened cold by someone with no cache at all.
 *
 * The banner keeps a flat surface rather than a shimmer — profile banners are one
 * of the three places colour is allowed, and guessing a gradient before the
 * profile loads would flash the wrong one.
 */
export default function Loading() {
  return (
    <main className="flex-1 flex flex-col">
      <div className="w-full h-[180px] sm:h-[220px]" style={{ background: "var(--bg2)" }} />

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 -mt-16 relative z-10 flex flex-col gap-8">
        <div className="flex items-end gap-4">
          <Skeleton w={96} h={96} radius="999px" />
          <div className="flex flex-col gap-2 pb-2">
            <Skeleton h={26} w={190} />
            <Skeleton h={13} w={120} />
          </div>
        </div>

        {/* Counts row — shows / episodes / hours / lists */}
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 items-center">
              <Skeleton h={24} w={52} />
              <Skeleton h={10} w={58} />
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-3">
          <SectionLabelSkeleton w={150} />
          <PosterGridSkeleton count={8} />
        </section>

        <div className="h-16" />
      </div>
    </main>
  );
}
