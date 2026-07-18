"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchApiResponse, SearchApiResult } from "@/app/api/search/route";

type Props = {
  username: string;
  displayName: string | null;
};

const TITLE_MAP: Record<string, string> = {
  "/home": "Home",
  "/discover": "Discover",
  "/library": "Library",
  "/stats": "Stats",
  "/tiers": "Tiers",
  "/settings": "Settings",
};

/**
 * Desktop-only topbar with a search dropdown. Type → results appear below
 * as a glassmorphic panel. Click a result → jump to that title. "See all" →
 * /discover. Enter submits directly to /discover (equivalent to See all).
 */
export function TopBar({ username, displayName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const title = deriveTitle(pathname);
  const initial = ((displayName || username)[0] ?? "?").toUpperCase();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchApiResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdown on route change.
  useEffect(() => {
    setIsOpen(false);
    setQuery("");
  }, [pathname]);

  // Debounced fetch.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setTotalResults(0);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: abort.signal },
        );
        const data: SearchApiResponse = await res.json();
        setResults(data.results);
        setTotalResults(data.totalResults);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setTotalResults(0);
        }
      } finally {
        setIsLoading(false);
      }
    }, 250);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Close on click outside.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/discover?q=${encodeURIComponent(trimmed)}`);
    setIsOpen(false);
  };

  const showDropdown =
    isOpen && query.trim().length >= 2 && (isLoading || results.length > 0);

  return (
    <header
      className="hidden md:flex items-center gap-4 px-6 h-16 shrink-0 border-b sticky top-0 z-30"
      style={{
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        borderColor: "var(--border)",
        backdropFilter: "blur(20px) saturate(1.2)",
        WebkitBackdropFilter: "blur(20px) saturate(1.2)",
      }}
    >
      <h1 className="text-lg font-semibold tracking-tight w-40 shrink-0">
        {title}
      </h1>

      <div
        ref={containerRef}
        className="relative flex-1 max-w-xl"
      >
        <form onSubmit={submit} role="search">
          <Search
            aria-hidden
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--meta)" }}
          />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsOpen(false);
            }}
            placeholder="Search movies, shows, anime…"
            autoComplete="off"
            className="w-full h-9 pl-10 pr-3 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
            style={{
              background: "var(--secondary)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
            }}
          />
        </form>

        {showDropdown && (
          <SearchDropdown
            query={query}
            results={results}
            totalResults={totalResults}
            isLoading={isLoading}
            onResultClick={() => setIsOpen(false)}
          />
        )}
      </div>

      <div
        className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0"
        style={{
          background: "var(--secondary)",
          color: "var(--body)",
          border: "1px solid var(--border)",
        }}
        title="Content region"
      >
        <span aria-hidden>🇮🇳</span>
        <span>IN</span>
      </div>

      <Link
        href={`/u/${username}`}
        className="w-9 h-9 rounded-full grid place-items-center font-bold text-sm shrink-0 hover:brightness-110 transition"
        style={{
          background: "var(--surface2)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        }}
        aria-label="Your profile"
      >
        {initial}
      </Link>
    </header>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────

function SearchDropdown({
  query,
  results,
  totalResults,
  isLoading,
  onResultClick,
}: {
  query: string;
  results: SearchApiResult[];
  totalResults: number;
  isLoading: boolean;
  onResultClick: () => void;
}) {
  return (
    <div
      className="glass absolute top-[calc(100%+8px)] left-0 right-0 flex flex-col overflow-hidden shadow-lg"
      style={{
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow)",
      }}
    >
      {isLoading && results.length === 0 ? (
        <div className="px-4 py-3 text-sm text-meta">Searching…</div>
      ) : results.length === 0 ? (
        <div className="px-4 py-3 text-sm text-meta">
          No results for &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <ul>
          {results.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              <Link
                href={`/title/${r.type}/${r.id}`}
                onClick={onResultClick}
                className="flex items-center gap-3 px-3 py-2 hover:bg-secondary transition"
              >
                <div
                  className="shrink-0 overflow-hidden"
                  style={{
                    width: 40,
                    height: 60,
                    borderRadius: "calc(var(--radius-input) - 4px)",
                    boxShadow: "var(--poster-shadow)",
                  }}
                >
                  {r.posterUrl ? (
                    <Image
                      src={r.posterUrl}
                      alt=""
                      width={40}
                      height={60}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div
                      className="w-full h-full grid place-items-center font-bold text-sm"
                      style={{ background: "var(--bg2)", color: "var(--meta)" }}
                    >
                      {r.title[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-sm font-semibold truncate">{r.title}</p>
                  <p className="text-xs text-meta">
                    {r.type === "movie" ? "Movie" : "TV"}
                    {r.year ? ` · ${r.year}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {results.length > 0 && (
        <Link
          href={`/discover?q=${encodeURIComponent(query.trim())}`}
          onClick={onResultClick}
          className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-secondary transition border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <span>
            See all {totalResults} result{totalResults === 1 ? "" : "s"}
          </span>
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}

function deriveTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  const first = "/" + (pathname.split("/")[1] ?? "");
  return TITLE_MAP[first] ?? "BingeTrackr";
}
