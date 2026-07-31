import {
  PageHeadingSkeleton,
  PosterRailSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Mirrors `tiers/page.tsx`: heading, five tier bands, then the unranked tray.
 *
 * Tier bands are the one place colour is allowed (`AGENTS.md`), but the skeleton
 * stays monochrome on purpose — inventing band colours before the board loads
 * would flash the wrong hues.
 */
export default function Loading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <PageHeadingSkeleton w={130} subtitle />

      <div className="flex flex-col gap-3">
        {["S", "A", "B", "C", "D"].map((t) => (
          <div
            key={t}
            className="glass flex items-stretch gap-3 p-3"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <Skeleton w={56} h={84} />
            <div className="flex-1 flex gap-2 overflow-hidden">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} w={56} h={84} radius="var(--radius-card)" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <Skeleton h={11} w={120} />
        <PosterRailSkeleton count={8} cardWidth={110} />
      </section>
    </main>
  );
}
