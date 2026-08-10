import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
    /**
     * Two changes from Next's defaults, both aimed at Vercel's free-tier
     * Image Optimization budget (Hobby plan: 5,000 transformations/month —
     * this project hit 75% of that). Vercel counts one transformation per
     * unique (source URL, width bucket, format) the first time it's
     * requested; after that it's cached. Usage here scales with how many
     * DISTINCT posters/backdrops get shown, not with total traffic — this
     * app deliberately surfaces a large slice of TMDB's catalogue (Discover's
     * genre/language/provider/decade axes, free-text search, any title page a
     * visitor lands on), so that's expected and not a bug to "fix" by
     * cutting a feature. These two knobs cut real waste instead:
     *
     * 1. `deviceSizes` drops Next's default 2048/3840 buckets. Every image in
     *    this app is fetched from TMDB pre-sized at w185/w342/w500/w780/w1280
     *    (`posterUrl`/`backdropUrl`, `lib/tmdb/client.ts`) — nothing sourced
     *    here is ever wider than 1280px. Asking the optimizer to also produce
     *    1920+/2048/3840 variants of a 1280px source is a pure-upscale
     *    transformation that gets counted and cached for a size that can
     *    never look sharper than the 1280px original — wasted budget for
     *    zero visual benefit. The title page's full-bleed backdrop
     *    (`sizes="100vw"`) is the one place this actually mattered: it's the
     *    only `fill` image genuinely wide enough to request the top buckets.
     * 2. `minimumCacheTTL` goes from Next's 4h default to 1 year. A TMDB
     *    image path is immutable — the same URL never changes what it
     *    points at — so there is no correctness reason to ever let a cached
     *    transformation expire and force a re-transform (which re-spends a
     *    transformation credit for pixels that were already optimized once).
     *    The 4h default is tuned for content that actually changes; TMDB
     *    posters don't.
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
