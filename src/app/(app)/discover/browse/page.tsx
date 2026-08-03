import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPosterItems } from "@/components/trackr/BrowseSection";
import { PosterSizeShell } from "@/components/trackr/PosterSizeShell";
import { TrackablePosterGrid } from "@/components/trackr/TrackablePosterGrid";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";
import {
  browseHeading,
  buildBrowseHref,
  DECADES,
  IN_WATCH_PROVIDERS,
  languagesForType,
  parseBrowseQuery,
  SORT_OPTIONS,
  toDiscoverParams,
  type BrowseQuery,
  type RawBrowseParams,
} from "@/lib/discover/axes";
import { discoverTitlesPage, getGenres } from "@/lib/tmdb/client";
import { getAllTrackStates } from "@/lib/tracking/queries";

type SearchParams = Promise<RawBrowseParams>;

/**
 * The drilled-into browse grid. Every filter is a plain `<Link>` that rewrites
 * the query string — no client state, no JS, and the resulting view is
 * shareable and back-button-correct (`DESIGN_ROADMAP.md`).
 *
 * The whole page is one `discoverTitlesPage` call plus a 7-day-cached genre
 * list; the axis config lives in `src/lib/discover/axes.ts` and nothing here is
 * specific to any one axis.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = parseBrowseQuery(await searchParams);
  const genres = await getGenres(q.type).catch(() => []);
  const genreName = genres.find((g) => g.id === q.genre)?.name ?? null;
  return { title: `${browseHeading(q, genreName)} — BingeTrackr` };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = parseBrowseQuery(await searchParams);

  const cookieStore = await cookies();
  const posterSize = parsePosterSize(
    cookieStore.get(POSTER_SIZE_COOKIE)?.value,
  );

  // `toDiscoverParams` needs today's date to cap the "newest" sort at titles
  // that have actually been released. Passed in rather than read inside so the
  // mapping stays a pure function.
  const todayIso = new Date().toISOString().slice(0, 10);

  const [genres, { results, totalPages }, trackStates] = await Promise.all([
    getGenres(q.type).catch(() => []),
    discoverTitlesPage(q.type, toDiscoverParams(q, todayIso), q.page),
    getAllTrackStates(),
  ]);

  const genreName = genres.find((g) => g.id === q.genre)?.name ?? null;
  const page = Math.min(q.page, totalPages);

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/discover"
            className="text-xs font-semibold text-meta hover:text-foreground transition inline-flex items-center gap-1 self-start"
          >
            <ArrowLeft size={12} aria-hidden />
            Discover
          </Link>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {browseHeading(q, genreName)}
          </h1>
        </div>

        <Filters q={q} genres={genres} />

        <PosterSizeShell size={posterSize}>
          {results.length === 0 ? (
            <EmptyBrowse />
          ) : (
            <>
              <TrackablePosterGrid
                trackStates={trackStates}
                items={toPosterItems(results)}
              />
              <Pager q={q} page={page} totalPages={totalPages} />
            </>
          )}
        </PosterSizeShell>
      </div>
    </main>
  );
}

// ─── Filters ───────────────────────────────────────────────────────────────

/**
 * Facets as links. Clicking an active chip clears that facet, which is the
 * behaviour a filter bar needs and costs nothing to express in a URL — the
 * `null` simply drops the param in `buildBrowseHref`.
 *
 * Any facet change resets to page 1. Staying on page 7 while narrowing from
 * "all films" to "Kannada films" would land on an empty grid.
 */
function Filters({
  q,
  genres,
}: {
  q: BrowseQuery;
  genres: { id: number; name: string }[];
}) {
  /** Same query with one facet replaced, back at page 1. */
  const to = (patch: Partial<BrowseQuery>) =>
    buildBrowseHref({ ...q, ...patch, page: 1 });

  /**
   * Switching type has to drop facets the new type can't express, or the user
   * lands on an empty grid holding a filter with no chip left to clear it with.
   * Genre always goes — the movie and TV id sets don't overlap, so movie genre
   * 28 means nothing on TV. Language goes only if the new type doesn't offer it.
   */
  const toType = (type: BrowseQuery["type"]) =>
    to({
      type,
      genre: null,
      lang: languagesForType(type).some((l) => l.code === q.lang)
        ? q.lang
        : null,
    });

  return (
    <div className="flex flex-col gap-3">
      <FacetRow label="Type">
        <Facet href={toType("movie")} active={q.type === "movie"}>
          Movies
        </Facet>
        <Facet href={toType("tv")} active={q.type === "tv"}>
          TV
        </Facet>
      </FacetRow>

      <FacetRow label="Sort">
        {SORT_OPTIONS.map((s) => (
          <Facet key={s.key} href={to({ sort: s.key })} active={q.sort === s.key}>
            {s.label}
          </Facet>
        ))}
      </FacetRow>

      {genres.length > 0 && (
        <FacetRow label="Genre">
          {genres.map((g) => (
            <Facet
              key={g.id}
              href={to({ genre: q.genre === g.id ? null : g.id })}
              active={q.genre === g.id}
            >
              {g.name}
            </Facet>
          ))}
        </FacetRow>
      )}

      {/* TMDB has almost no regional-language TV, so the TV list is Hindi only
          — see `languagesForType`. */}
      <FacetRow label="Language">
        {languagesForType(q.type).map((l) => (
          <Facet
            key={l.code}
            href={to({ lang: q.lang === l.code ? null : l.code })}
            active={q.lang === l.code}
          >
            {l.label}
          </Facet>
        ))}
      </FacetRow>

      <FacetRow label="Streaming in India">
        {IN_WATCH_PROVIDERS.map((p) => (
          <Facet
            key={p.id}
            href={to({ provider: q.provider === p.id ? null : p.id })}
            active={q.provider === p.id}
          >
            {p.label}
          </Facet>
        ))}
      </FacetRow>

      <FacetRow label="Decade">
        {DECADES.map((d) => (
          <Facet
            key={d.start}
            href={to({ decade: q.decade === d.start ? null : d.start })}
            active={q.decade === d.start}
          >
            {d.label}
          </Facet>
        ))}
      </FacetRow>
    </div>
  );
}

function FacetRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-meta w-full sm:w-36 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Facet({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className="px-3 py-1.5 text-xs font-semibold transition hover:brightness-125"
      style={{
        background: active ? "var(--accent)" : "var(--secondary)",
        color: active ? "var(--accent-ink)" : "var(--body)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {children}
    </Link>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────

function Pager({
  q,
  page,
  totalPages,
}: {
  q: BrowseQuery;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 pt-2"
    >
      <PagerLink
        href={buildBrowseHref({ ...q, page: page - 1 })}
        disabled={page <= 1}
      >
        <ArrowLeft size={13} aria-hidden />
        Previous
      </PagerLink>
      <span className="text-xs text-meta tabular-nums">
        Page {page} of {totalPages}
      </span>
      <PagerLink
        href={buildBrowseHref({ ...q, page: page + 1 })}
        disabled={page >= totalPages}
      >
        Next
        <ArrowRight size={13} aria-hidden />
      </PagerLink>
    </nav>
  );
}

/** A disabled page link is a `<span>`, not a dead `<a>` — nothing to focus. */
function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition";
  const style = {
    background: "var(--secondary)",
    color: "var(--body)",
    borderRadius: "var(--radius-pill)",
  };

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} opacity-40`}
        style={style}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${className} hover:brightness-125`} style={style}>
      {children}
    </Link>
  );
}

// ─── Empty ─────────────────────────────────────────────────────────────────

/**
 * Unlike a rail, an empty grid here is a real answer — the user chose these
 * filters. Narrow combinations genuinely return nothing (Kannada + War +
 * 1980s), so the copy says which lever to pull.
 */
function EmptyBrowse() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Compass size={22} aria-hidden style={{ color: "var(--meta)" }} />
      <p className="text-lg font-semibold">Nothing matches those filters.</p>
      <p className="text-sm text-body max-w-sm">
        That combination is a bit too narrow. Try clearing the decade or the
        genre — language and streaming service are the tightest filters here.
      </p>
      <Button asChild variant="outline" className="mt-1">
        <Link href="/discover">Back to Discover</Link>
      </Button>
    </div>
  );
}
