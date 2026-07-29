import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb/client";

type Size = "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { w: number; h: number; tmdbSize: "w185" | "w342" | "w500" }> = {
  sm: { w: 120, h: 180, tmdbSize: "w185" },
  md: { w: 180, h: 270, tmdbSize: "w342" },
  lg: { w: 240, h: 360, tmdbSize: "w500" },
};

type PosterCardProps = {
  title: string;
  posterPath: string | null | undefined;
  year?: number | null;
  href?: string;
  size?: Size;
  showLabel?: boolean;
  priority?: boolean;
  /**
   * Fill the parent grid cell instead of the fixed SIZE_MAP width. Required in
   * `.poster-grid`, where the column count — not the card — sets the width.
   * `size` then only picks the TMDB image resolution to request.
   */
  fluid?: boolean;
};

/**
 * The primary content-forward element. Poster art does the visual work;
 * chrome around it stays minimal. Gradient tile fallback matches the
 * "letter over hue" style from the design handoff.
 */
export function PosterCard({
  title,
  posterPath,
  year,
  href,
  size = "md",
  showLabel = true,
  priority = false,
  fluid = false,
}: PosterCardProps) {
  const dims = SIZE_MAP[size];
  const url = posterUrl(posterPath, dims.tmdbSize);
  const letter = (title[0] ?? "?").toUpperCase();
  const hue = hashHue(title);

  const inner = (
    <>
      <div
        className={
          fluid
            ? "relative overflow-hidden w-full group"
            : "relative overflow-hidden shrink-0 group"
        }
        style={{
          ...(fluid
            ? { aspectRatio: "2 / 3" }
            : { width: dims.w, height: dims.h }),
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--poster-shadow)",
        }}
      >
        {url ? (
          fluid ? (
            <Image
              src={url}
              alt={title}
              fill
              priority={priority}
              // Widest a card gets is ~230px (2 columns on a large phone /
              // 5 on desktop); these keep the browser off the 2x srcset.
              sizes="(min-width: 1024px) 16vw, (min-width: 640px) 24vw, 45vw"
              className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <Image
              src={url}
              alt={title}
              width={dims.w}
              height={dims.h}
              priority={priority}
              className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              style={{ width: "100%", height: "100%" }}
            />
          )
        ) : (
          <div
            className="grid place-items-center w-full h-full"
            style={{
              background: `linear-gradient(135deg,
                hsl(${hue} 45% 30%),
                hsl(${(hue + 20) % 360} 55% 20%))`,
            }}
          >
            <span
              className="font-extrabold text-white/20 tracking-tight"
              style={{
                fontSize: fluid ? "clamp(1.25rem, 9vw, 3.5rem)" : dims.w * 0.6,
              }}
            >
              {letter}
            </span>
          </div>
        )}
      </div>
      {showLabel && (
        <div
          className="flex flex-col gap-0.5"
          style={fluid ? { width: "100%" } : { width: dims.w }}
        >
          <p className="text-sm font-semibold leading-tight line-clamp-2">
            {title}
          </p>
          {year && <p className="text-xs text-meta">{year}</p>}
        </div>
      )}
    </>
  );

  if (!href) {
    return <div className="flex flex-col gap-2">{inner}</div>;
  }
  return (
    <Link href={href} className="flex flex-col gap-2 group focus-visible:outline-none">
      {inner}
    </Link>
  );
}

/**
 * Deterministic hue from title so the same title always gets the same
 * gradient fallback. 61 is chosen so consecutive alphabetical titles
 * (e.g. "Mad Max" vs "Madras") don't sit next to each other visually.
 */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h * 61) % 360;
}
