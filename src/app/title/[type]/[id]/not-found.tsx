import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Not-found UI for a title that doesn't exist on TMDB.
 *
 * WHY THE `noindex` TAG — read before removing it.
 *
 * This route streams (see `loading.tsx`), and once the first byte is flushed the
 * HTTP status is already committed as 200. A later `notFound()` therefore renders
 * this page under a **200, not a 404** — a soft-404. That was measured, not
 * assumed: with `loading.tsx` present a bogus id returns 200 for browsers *and*
 * for crawler user-agents, and moving the check into `generateMetadata` doesn't
 * help because Next streams metadata too. Removing `loading.tsx` restores a real
 * 404 but costs the instant paint (time-to-first-byte goes from ~15ms to ~150ms
 * warm, and up to ~1.7s on a cold TMDB cache).
 *
 * So the status code is given up deliberately, and the SEO problem is solved
 * directly instead: `noindex` tells crawlers not to index this page, which is the
 * actual thing a 404 would have achieved here. React hoists this into <head>.
 *
 * If you ever delete `loading.tsx` for this segment, the status becomes a real
 * 404 and this tag becomes redundant (harmless, but you can drop it).
 */
export default function TitleNotFound() {
  return (
    <>
      {/* Rendered value is normalised to plain `noindex` by React's metadata
          hoisting, and may appear twice (hoisted + inline) — both harmless. */}
      <meta name="robots" content="noindex" />
      <main className="flex-1 grid place-items-center px-4 py-24">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            Not found
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            We couldn&apos;t find that title.
          </h1>
          <p className="text-body">
            It may have been removed from TMDB, or the link might be wrong.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            <Button asChild>
              <Link href="/discover">Browse Discover</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/home">Go home</Link>
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
