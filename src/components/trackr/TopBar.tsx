"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

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
 * Desktop-only topbar. Sticky, with the current page title on the left,
 * a search field that GETs to /discover, a region chip, and the avatar
 * as a link to the owner's own profile.
 */
export function TopBar({ username, displayName }: Props) {
  const pathname = usePathname();
  const title = deriveTitle(pathname);
  const initial = ((displayName || username)[0] ?? "?").toUpperCase();

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

      {/* Search — inline form, submits to /discover */}
      <form
        action="/discover"
        method="GET"
        role="search"
        className="flex-1 max-w-xl relative"
      >
        <Search
          aria-hidden
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--meta)" }}
        />
        <input
          type="search"
          name="q"
          placeholder="Search movies, shows, anime…"
          className="w-full h-9 pl-10 pr-3 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
          style={{
            background: "var(--secondary)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
          }}
        />
      </form>

      {/* Region chip */}
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

      {/* Avatar → own profile */}
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

function deriveTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  // Fallback: match first segment.
  const first = "/" + (pathname.split("/")[1] ?? "");
  return TITLE_MAP[first] ?? "BingeTrackr";
}
