import {
  searchMulti,
  titleFromResult,
  trendingInRegion,
  yearFromResult,
  type TmdbSearchResult,
} from "@/lib/tmdb/client";
import { PosterCard } from "@/components/trackr/PosterCard";
import { SearchBar } from "@/components/trackr/SearchBar";

export const metadata = {
  title: "Discover — BingeTrackr",
};

type SearchParams = Promise<{ q?: string; type?: string }>;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, type } = await searchParams;
  const query = q?.trim() ?? "";

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Discover
          </h1>
          <SearchBar initialQuery={query} />
          <TypePills active={type ?? "all"} query={query} />
        </div>

        {query ? (
          <SearchResults query={query} typeFilter={type} />
        ) : (
          <TrendingSections />
        )}
      </div>
    </main>
  );
}

// ─── Type pills ────────────────────────────────────────────────────────────

function TypePills({ active, query }: { active: string; query: string }) {
  const opts = [
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
  typeFilter?: string;
}) {
  const raw = await searchMulti(query);
  const results = raw.filter((r) =>
    typeFilter && typeFilter !== "all" ? r.media_type === typeFilter : true,
  );

  if (results.length === 0) {
    return (
      <EmptyState
        title={`No results for "${query}"`}
        subtitle="Try a different spelling, or remove the type filter."
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Results ({results.length})</SectionLabel>
      <PosterGrid results={results} />
    </section>
  );
}

// ─── Trending (default view) ───────────────────────────────────────────────

async function TrendingSections() {
  const trending = await trendingInRegion("IN", "week");
  const movies = trending.filter((t) => t.media_type === "movie").slice(0, 10);
  const shows = trending.filter((t) => t.media_type === "tv").slice(0, 10);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <SectionLabel>Trending movies in India</SectionLabel>
        <PosterGrid results={movies} />
      </section>
      <section className="flex flex-col gap-3">
        <SectionLabel>Trending shows in India</SectionLabel>
        <PosterGrid results={shows} />
      </section>
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
}: {
  results: (TmdbSearchResult & { media_type: "movie" | "tv" })[];
}) {
  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, 180px)" }}>
      {results.map((r) => (
        <PosterCard
          key={`${r.media_type}-${r.id}`}
          title={titleFromResult(r)}
          posterPath={r.poster_path}
          year={yearFromResult(r)}
          href={`/title/${r.media_type}/${r.id}`}
          size="md"
        />
      ))}
    </div>
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
