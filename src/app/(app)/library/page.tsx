import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContinueWatchingCard } from "@/components/trackr/ContinueWatchingCard";
import { PosterSizeShell } from "@/components/trackr/PosterSizeShell";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  getContinueWatching,
  getDroppedItems,
  getLibraryCounts,
  getWatchedItems,
  getWatchlistItems,
  type LibraryPosterItem,
} from "@/lib/tracking/queries";

export const metadata = { title: "Library — BingeTrackr" };

type Tab = "watching" | "watched" | "watchlist" | "dropped";
const TABS: Tab[] = ["watching", "watched", "watchlist", "dropped"];

type SearchParams = Promise<{ tab?: string }>;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tab: rawTab } = await searchParams;
  const activeTab: Tab =
    (TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "watching");

  // Counts are cheap; always fetch them.
  const counts = await getLibraryCounts();

  // Same cookie Discover reads — the preference is global.
  const cookieStore = await cookies();
  const posterSize = parsePosterSize(
    cookieStore.get(POSTER_SIZE_COOKIE)?.value,
  );

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          Everything you&apos;ve tracked
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
          Library
        </h1>
      </header>

      <PosterSizeShell
        initial={posterSize}
        // Watching is a list of resume cards, not a poster grid — nothing to size.
        showToggle={activeTab !== "watching"}
        toolbar={<LibraryTabs activeTab={activeTab} counts={counts} />}
      >
        {activeTab === "watching" && <WatchingTab />}
        {activeTab === "watched" && <WatchedTab />}
        {activeTab === "watchlist" && <WatchlistTab />}
        {activeTab === "dropped" && <DroppedTab />}
      </PosterSizeShell>
    </main>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function LibraryTabs({
  activeTab,
  counts,
}: {
  activeTab: Tab;
  counts: Awaited<ReturnType<typeof getLibraryCounts>>;
}) {
  const labels: Record<Tab, string> = {
    watching: "Watching",
    watched: "Watched",
    watchlist: "Watchlist",
    dropped: "Dropped",
  };

  return (
    <nav className="flex gap-2 flex-wrap" role="tablist">
      {TABS.map((tab) => {
        const active = tab === activeTab;
        const count = counts[tab];
        return (
          <Link
            key={tab}
            href={tab === "watching" ? "/library" : `/library?tab=${tab}`}
            scroll={false}
            role="tab"
            aria-selected={active}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
            style={{
              background: active ? "var(--accent)" : "var(--secondary)",
              color: active ? "var(--accent-ink)" : "var(--body)",
            }}
          >
            <span>{labels[tab]}</span>
            <span
              className="text-xs font-medium tabular-nums"
              style={{
                color: active ? "var(--accent-ink)" : "var(--meta)",
                opacity: active ? 0.7 : 1,
              }}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Watching tab ──────────────────────────────────────────────────────────

/**
 * Library shows the complete in-progress list, so this cap only exists as a
 * backstop: getContinueWatching runs one episode query PER show (see
 * OPTIMIZATIONS.md #1), so an unbounded call here would be one query and a few
 * hundred rows per show. 100 is far past a realistic number of shows on the go;
 * the tab badge reports the true count either way.
 */
const WATCHING_CAP = 100;

async function WatchingTab() {
  const items = await getContinueWatching(WATCHING_CAP);

  if (items.length === 0) {
    return (
      <EmptyTab
        title="Nothing in progress."
        subtitle="Find a show and mark an episode — it'll show up here with a one-tap resume."
        ctaLabel="Browse shows"
        ctaHref="/discover"
      />
    );
  }

  // Same card as the home rail, but wrapped into a full grid — Library is where
  // you go to see everything, so nothing is hidden behind a horizontal scroll.
  return (
    <div className="cw-grid">
      {items.map((item) => (
        <ContinueWatchingCard key={item.mediaId} item={item} />
      ))}
    </div>
  );
}

// ─── Watched tab ───────────────────────────────────────────────────────────

async function WatchedTab() {
  const items = await getWatchedItems();

  if (items.length === 0) {
    return (
      <EmptyTab
        title="Nothing marked watched yet."
        subtitle="Mark a movie as watched from any title page, or set a show to Completed via the status picker."
        ctaLabel="Discover"
        ctaHref="/discover"
      />
    );
  }
  return <LibraryPosterGrid items={items} />;
}

// ─── Watchlist tab ─────────────────────────────────────────────────────────

async function WatchlistTab() {
  const items = await getWatchlistItems();

  if (items.length === 0) {
    return (
      <EmptyTab
        title="Nothing on your watchlist."
        subtitle="Hit the Watchlist button on anything you want to watch later. Only you can see this list."
        ctaLabel="Browse shows"
        ctaHref="/discover"
      />
    );
  }
  return <LibraryPosterGrid items={items} />;
}

// ─── Dropped tab ───────────────────────────────────────────────────────────

async function DroppedTab() {
  const items = await getDroppedItems();

  if (items.length === 0) {
    return (
      <EmptyTab
        title="Nothing dropped."
        subtitle="Life's short — if a show isn't hitting, set it to Dropped from the status picker. It'll live here."
      />
    );
  }
  return <LibraryPosterGrid items={items} dimmed />;
}

// ─── Primitives ────────────────────────────────────────────────────────────

function LibraryPosterGrid({
  items,
  dimmed = false,
}: {
  items: LibraryPosterItem[];
  dimmed?: boolean;
}) {
  return (
    <TrackablePosterGrid
      items={items.map((item) => ({
        key: item.mediaId,
        title: item.title,
        posterPath: item.posterPath,
        year: item.releaseYear,
        tmdbId: item.tmdbId,
        tmdbType: item.tmdbType,
        meta: item.meta,
        dimmed,
      }))}
    />
  );
}

function EmptyTab({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div
      className="glass p-8 flex flex-col items-start gap-3 max-w-xl"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-body">{subtitle}</p>
      {ctaLabel && ctaHref && (
        <Button asChild className="mt-2">
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      )}
    </div>
  );
}
