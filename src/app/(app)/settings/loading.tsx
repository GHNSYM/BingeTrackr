import {
  PageHeadingSkeleton,
  SectionLabelSkeleton,
  Skeleton,
} from "@/components/trackr/LoadingSkeleton";

/**
 * Mirrors `settings/page.tsx` (max-w-2xl): heading, then five section cards
 * with 1-3 rows each. The page's own fetch is a single cached profile read
 * plus a cookie read — fast enough that this rarely paints — but every
 * dynamic route gets one per AGENTS.md's "no spinners" rule.
 */
export default function Loading() {
  const sections = [
    { rows: 2 },
    { rows: 3 },
    { rows: 3 },
    { rows: 1 },
    { rows: 1 },
  ];

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">
      <PageHeadingSkeleton w={120} subtitle />

      {sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-3">
          <SectionLabelSkeleton w={90} />
          <div
            className="glass flex flex-col divide-y"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            {Array.from({ length: s.rows }, (_, r) => (
              <div key={r} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <Skeleton h={13} w="35%" />
                  <Skeleton h={11} w="70%" />
                </div>
                <Skeleton h={30} w={92} className="shrink-0" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
