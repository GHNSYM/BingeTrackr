import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContinueWatchingCard } from "@/components/trackr/ContinueWatchingCard";
import { requireOnboardedUser } from "@/lib/auth/require-user";
import { getContinueWatching } from "@/lib/tracking/queries";

export default async function HomePage() {
  const { profile } = await requireOnboardedUser();
  const continueWatching = await getContinueWatching(12);

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-3xl mx-auto w-full flex flex-col gap-10">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          Home
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
          Hey, @{profile.username}.
        </h1>
      </header>

      {/* Continue watching */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            Continue watching
          </h2>
          {continueWatching.length > 0 && (
            <span className="text-xs text-meta">
              {continueWatching.length} show
              {continueWatching.length === 1 ? "" : "s"} in progress
            </span>
          )}
        </div>

        {continueWatching.length > 0 ? (
          <div className="flex flex-col gap-3">
            {continueWatching.map((item) => (
              <ContinueWatchingCard key={item.mediaId} item={item} />
            ))}
          </div>
        ) : (
          <EmptyContinueWatching />
        )}
      </section>
    </main>
  );
}

function EmptyContinueWatching() {
  return (
    <div
      className="glass p-8 flex flex-col gap-3 items-start"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">Nothing in progress yet.</p>
      <p className="text-body text-sm max-w-md">
        Find a show you want to track — mark the episodes as you go and this
        page becomes your homepage for real. Movies, K-drama, anime, Bollywood,
        regional cinema, whatever you&apos;re into.
      </p>
      <Button asChild className="mt-2">
        <Link href="/discover">Browse shows</Link>
      </Button>
    </div>
  );
}
