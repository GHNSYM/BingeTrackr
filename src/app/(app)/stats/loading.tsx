import {
  PageHeadingSkeleton,
  RailSectionSkeleton,
  SectionLabelSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/** Mirrors `stats/page.tsx` (max-w-4xl): heading, stat tiles, top shows. */
export default function Loading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-4xl mx-auto w-full flex flex-col gap-8">
      <PageHeadingSkeleton w={140} subtitle />

      {/* Lifetime tiles */}
      <section className="flex flex-col gap-3">
        <SectionLabelSkeleton w={90} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="glass p-4 flex flex-col gap-2"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <Skeleton h={28} w="70%" />
              <Skeleton h={11} w="90%" />
            </div>
          ))}
        </div>
      </section>

      {/* This year */}
      <section className="flex flex-col gap-3">
        <SectionLabelSkeleton w={110} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="glass p-4 flex flex-col gap-2"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <Skeleton h={28} w="60%" />
              <Skeleton h={11} w="85%" />
            </div>
          ))}
        </div>
      </section>

      <RailSectionSkeleton count={5} cardWidth={140} labelWidth={130} />
    </main>
  );
}
