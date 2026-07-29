import { cookies } from "next/headers";
import {
  searchMulti,
  titleFromResult,
  trendingInRegion,
  yearFromResult,
  type TmdbMediaSearchResult,
} from "@/lib/tmdb/client";
import { PosterSizeShell } from "@/components/trackr/PosterSizeShell";
import { SearchBar } from "@/components/trackr/SearchBar";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  getQuickTrackStates,
  type QuickTrackState,
} from "@/lib/tracking/queries";

export const metadata = {
  title: "Discover — BingeTrackr",
};

/**
 * TMDB pages to pull per grid (20 results each). Two gives us ~40 posters per
 * section, enough to fill 6+ rows at every poster size.
 */
const DISCOVER_PAGES = 2;

type SearchParams = Promise<{ q?: string; type?: string }>;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, type } = await searchParams;
  const query = q?.trim() ?? "";
  const typeFilter = normalizeType(type);

  const cookieStore = await cookies();
  const posterSize = parsePosterSize(
    cookieStore.get(POSTER_SIZE_COOKIE)?.value,
  );

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Discover
          </h1>
          {/* On desktop the topbar has search. On mobile there's no topbar,
              so we keep the input here as the entry point. */}
          <div className="md:hidden">
            <SearchBar initialQuery={query} typeFilter={typeFilter} />
          </div>
        </div>

        <PosterSizeShell
          initial={posterSize}
          toolbar={<TypePills active={typeFilter} query={query} />}
        >
          {query ? (
            <SearchResults query={query} typeFilter={typeFilter} />
          ) : (
            <TrendingSections typeFilter={typeFilter} />
          )}
        </PosterSizeShell>
      </div>
    </main>
  );
}

// ─── Type pills ────────────────────────────────────────────────────────────

type TypeFilter = "all" | "movie" | "tv";

function normalizeType(value: string | undefined): TypeFilter {
  return value === "movie" || value === "tv" ? value : "all";
}

function TypePills({ active, query }: { active: TypeFilter; query: string }) {
  const opts: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "movie", label: "Movies" },
    { key: "tv", label: "TV" },
  ];
  return (
    <div className="flex gap-2">
      {opts.map((o) => {
        const href = buildDiscoverHref(query, o.key);
        const isActive = active === o.key;
        return (
          <a
            key={o.key}
            href={href}
            className="px-4 py-1.5 text-sm font-semibold rounded-full transition"
            style={{
              background: isActive ? "var(--accent)" : "var(--secondary)",
              color: isActive ? "var(--accent-ink)" : "var(--body)",
            }}
          >
            {o.label}
          </a>
        );
      })}
    </div>
  );
}

function buildDiscoverHref(q: string, type: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type && type !== "all") params.set("type", type);
  const s = params.toString();
  return s ? `/discover?${s}` : "/discover";
}

// ─── Search results ────────────────────────────────────────────────────────

async function SearchResults({
  query,
  typeFilter,
}: {
  query: string;
  typeFilter: TypeFilter;
}) {
  const raw = await searchMulti(query, DISCOVER_PAGES);
  const results = raw.filter((r) =>
    typeFilter === "all" ? true : r.media_type === typeFilter,
  );

  if (results.length === 0) {
    return (
      <EmptyState
        title={`No results for "${query}"`}
        subtitle="Try a different spelling, or remove the type filter."
      />
    );
  }

  const trackStates = await getQuickTrackStates(
    results.map((r) => ({ tmdbId: r.id, tmdbType: r.media_type })),
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Results ({results.length})</SectionLabel>
      <PosterGrid results={results} trackStates={trackStates} />
    </section>
  );
}

// ─── Trending (default view) ───────────────────────────────────────────────

async function TrendingSections({ typeFilter }: { typeFilter: TypeFilter }) {
  const { movies, shows } = await trendingInRegion(
    "IN",
    "week",
    DISCOVER_PAGES,
  );

  const visible = [
    ...(typeFilter !== "tv" ? movies : []),
    ...(typeFilter !== "movie" ? shows : []),
  ];
  const trackStates = await getQuickTrackStates(
    visible.map((r) => ({ tmdbId: r.id, tmdbType: r.media_type })),
  );

  return (
    <div className="flex flex-col gap-10">
      {typeFilter !== "tv" && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Trending movies in India</SectionLabel>
          <PosterGrid results={movies} trackStates={trackStates} />
        </section>
      )}
      {typeFilter !== "movie" && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Trending shows in India</SectionLabel>
          <PosterGrid results={shows} trackStates={trackStates} />
        </section>
      )}
    </div>
  );
}

// ─── Small primitives ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
      {children}
    </h2>
  );
}

function PosterGrid({
  results,
  trackStates,
}: {
  results: TmdbMediaSearchResult[];
  trackStates: Map<string, QuickTrackState>;
}) {
  return (
    <TrackablePosterGrid
      trackStates={trackStates}
      items={results.map((r) => ({
        key: `${r.media_type}-${r.id}`,
        title: titleFromResult(r),
        posterPath: r.poster_path,
        year: yearFromResult(r),
        tmdbId: r.id,
        tmdbType: r.media_type,
      }))}
    />
  );
}

function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-16 text-center"
      style={{ color: "var(--body)" }}
    >
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="text-sm">{subtitle}</p>
    </div>
  );
}
