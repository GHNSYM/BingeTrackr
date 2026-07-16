import { Search } from "lucide-react";

type SearchBarProps = {
  initialQuery?: string;
  placeholder?: string;
  action?: string;
};

/**
 * Zero-JS search bar. A GET form submits to /discover?q=... — meaning
 * search works without JS enabled and the URL is bookmarkable/shareable.
 * Debounced instant-results can layer on top later without changing this.
 */
export function SearchBar({
  initialQuery = "",
  placeholder = "Search movies, shows, anime…",
  action = "/discover",
}: SearchBarProps) {
  return (
    <form
      action={action}
      method="GET"
      className="relative flex items-center w-full"
      role="search"
    >
      <Search
        aria-hidden
        className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
        size={18}
        style={{ color: "var(--meta)" }}
      />
      <input
        type="search"
        name="q"
        defaultValue={initialQuery}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full h-12 pl-11 pr-4 rounded-xl bg-secondary text-foreground placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
        style={{ borderRadius: "var(--radius-input)" }}
      />
    </form>
  );
}
