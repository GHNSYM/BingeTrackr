import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  getGenres,
  searchMulti,
  titleFromResult,
  trendingInRegion,
  yearFromResult,
  type TmdbMediaSearchResult,
  type TmdbMediaType,
} from "@/lib/tmdb/client";
import { BrowseSection } from "@/components/trackr/BrowseSection";
import { EditorialSection } from "@/components/trackr/EditorialSection";
import {
  PosterSectionSkeleton,
  RailSectionSkeleton,
} from "@/components/trackr/LoadingSkeleton";
import { PosterSizeShell } from "@/components/trackr/PosterSizeShell";
import { SearchBar } from "@/components/trackr/SearchBar";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  buildBrowseHref,
  DECADES,
  DISCOVER_RAILS,
  IN_WATCH_PROVIDERS,
  languagesForType,
  MOOD_AXES,
} from "@/lib/discover/axes";
import { getFranchiseRows, getMustWatchRows } from "@/lib/discover/editorial";
import {
  getQuickTrackStates,
  type QuickTrackState,
} from "@/lib/tracking/queries";

export const metadata = {
  title: "Discover — BingeTrackr",
};

/**
 * Search pulls two TMDB pages (~40 results) because depth is the whole point of
 * a search. Trending pulls **one**, deliberately: it is now the anchor above a
 * page of browse rails rather than the entire page, and page 1 of
 * `/trending/{type}/week?region=IN` is the byte-identical URL Home's hero
 * already fetches — so the two routes share one fetch-cache entry instead of
 * costing a call each.
 */
const SEARCH_PAGES = 2;
const TRENDING_PAGES = 1;

/** Rails are an overview; 20 is two screens of horizontal scroll. */
const RAIL_LIMIT = 20;

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
          size={posterSize}
          toolbar={<TypePills active={typeFilter} query={query} />}
        >
          {query ? (
            <SearchResults query={query} typeFilter={typeFilter} />
          ) : (
            <LandingSections typeFilter={typeFilter} />
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
  const raw = await searchMulti(query, SEARCH_PAGES);
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

  // Bounded to what's on screen — the batched read is cheaper than the
  // whole-library one when there's a single grid. (See `getAllTrackStates`.)
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

// ─── Landing (default view) ────────────────────────────────────────────────

/**
 * The browse engine's front page: the trending anchor, then one rail per axis.
 *
 * `DESIGN_ROADMAP.md` describes the landing as rails throughout. Trending stays
 * a **grid** because it is the page's anchor — the one section that answers
 * "what should I watch right now" without the user picking an axis first, and it
 * earns the density. Everything below it is an axis, and axes are rails that
 * open into grids.
 *
 * Every rail is its own Suspense boundary, so the page paints immediately and
 * each row arrives when its own TMDB call lands — six sequential awaits would
 * otherwise stack into one long block. See `BrowseSection`.
 */
function LandingSections({ typeFilter }: { typeFilter: TypeFilter }) {
  const rails = DISCOVER_RAILS.filter(
    (r) => typeFilter === "all" || r.type === typeFilter,
  );

  return (
    <div className="flex flex-col gap-10">
      {/* Grid fallbacks, not rails — trending is the one section that stays a
          grid, and a rail skeleton swapping for a grid would reflow the page. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-10">
            {typeFilter !== "tv" && (
              <PosterSectionSkeleton count={20} labelWidth={210} />
            )}
            {typeFilter !== "movie" && (
              <PosterSectionSkeleton count={20} labelWidth={190} />
            )}
          </div>
        }
      >
        <TrendingSections typeFilter={typeFilter} />
      </Suspense>

      {/*
        Phase 2's editorial rows — see DESIGN_ROADMAP.md. Placed right after
        the Trending anchor and ahead of the mechanical Phase 1 axes below:
        these are hand-picked, and a curated row earns a more prominent slot
        than a "browse by decade" chip. Movie-only (typeFilter === "tv" hides
        them) — Must-watches mixes in two TV picks regardless, since it's one
        deliberately cross-media list, not a per-type axis.
      */}
      {typeFilter !== "tv" && (
        <>
          <Suspense fallback={<RailSectionSkeleton count={6} labelWidth={120} />}>
            <FranchiseSections />
          </Suspense>
          <Suspense fallback={<RailSectionSkeleton count={8} labelWidth={140} />}>
            <MustWatchSection />
          </Suspense>
          {MOOD_AXES.map((mood) => (
            <Suspense
              key={mood.key}
              fallback={
                <RailSectionSkeleton count={8} labelWidth={mood.label.length * 7} />
              }
            >
              <BrowseSection label={mood.label} type={mood.type} params={mood.params} limit={RAIL_LIMIT} />
            </Suspense>
          ))}
        </>
      )}

      <Suspense fallback={<BrowseChipsSkeleton />}>
        <BrowseChips typeFilter={typeFilter} />
      </Suspense>

      {rails.map((rail) => (
        <Suspense
          key={rail.key}
          fallback={
            <RailSectionSkeleton count={8} labelWidth={rail.label.length * 7} />
          }
        >
          <BrowseSection
            label={rail.label}
            type={rail.type}
            params={rail.params}
            limit={RAIL_LIMIT}
            seeAllHref={buildBrowseHref(rail.seeAll)}
          />
        </Suspense>
      ))}
    </div>
  );
}

async function TrendingSections({ typeFilter }: { typeFilter: TypeFilter }) {
  const { movies, shows } = await trendingInRegion(
    "IN",
    "week",
    TRENDING_PAGES,
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

// ─── Editorial (Phase 2) ────────────────────────────────────────────────────

async function FranchiseSections() {
  const rows = await getFranchiseRows();
  return <EditorialSection rows={rows} />;
}

async function MustWatchSection() {
  const rows = await getMustWatchRows();
  return <EditorialSection rows={rows} />;
}

// ─── Browse-by chips ───────────────────────────────────────────────────────

/**
 * Every browse axis as a link, costing one 7-day-cached TMDB call for the genre
 * names and nothing else. This is where axes go by default: a chip is free and a
 * rail costs a call plus a screenful of scroll (see the note on
 * `DISCOVER_RAILS`).
 */
async function BrowseChips({ typeFilter }: { typeFilter: TypeFilter }) {
  // Genre ids are not shared between movie and tv, so the chips have to commit
  // to one type. "All" browses films — the larger catalogue.
  const chipType: TmdbMediaType = typeFilter === "tv" ? "tv" : "movie";
  const genres = await getGenres(chipType).catch(() => []);

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Browse by</SectionLabel>

      {genres.length > 0 && (
        <ChipRow title="Genre">
          {genres.map((g) => (
            <Chip
              key={g.id}
              href={buildBrowseHref({ type: chipType, genre: g.id })}
            >
              {g.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      <ChipRow title="Language">
        {languagesForType(chipType).map((l) => (
          <Chip
            key={l.code}
            href={buildBrowseHref({
              type: chipType,
              lang: l.code,
              sort: "rating",
            })}
          >
            {l.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow title="Streaming in India">
        {IN_WATCH_PROVIDERS.map((p) => (
          <Chip
            key={p.id}
            href={buildBrowseHref({ type: chipType, provider: p.id })}
          >
            {p.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow title="Decade">
        {DECADES.map((d) => (
          <Chip
            key={d.start}
            href={buildBrowseHref({ type: chipType, decade: d.start })}
          >
            {d.label}
          </Chip>
        ))}
      </ChipRow>
    </section>
  );
}

function ChipRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-meta">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-xs font-semibold transition hover:brightness-125"
      style={{
        background: "var(--secondary)",
        color: "var(--body)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {children}
    </Link>
  );
}

function BrowseChipsSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <div className="skeleton" style={{ height: 11, width: 90 }} aria-hidden />
      {[10, 8, 8, 5].map((n, row) => (
        <div key={row} className="flex flex-col gap-2">
          <div
            className="skeleton"
            style={{ height: 10, width: 70 }}
            aria-hidden
          />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: n }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="skeleton"
                style={{
                  height: 28,
                  width: 60 + ((i * 17) % 40),
                  borderRadius: "var(--radius-pill)",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
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
