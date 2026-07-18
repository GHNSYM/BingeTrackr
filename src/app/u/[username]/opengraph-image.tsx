import { ImageResponse } from "next/og";
import {
  bannerGradient,
  getProfileByUsername,
  getPublicProfileCounts,
} from "@/lib/tracking/queries";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "BingeTrackr profile";

type Params = { username: string };

/**
 * Dynamic OG image for /u/[username]. Rendered by satori under next/og.
 * Uses only inline CSS (satori's supported subset) — no custom fonts,
 * no external images, all data comes from Supabase via our helpers.
 */
export default async function ProfileOgImage({ params }: { params: Params }) {
  const profile = await getProfileByUsername(params.username);

  // Private / missing profile — render a generic BingeTrackr card so links
  // still preview cleanly. Better than exposing "this profile is private".
  if (!profile || !profile.is_public) {
    return new ImageResponse(<GenericCard />, size);
  }

  const counts = await getPublicProfileCounts(profile.id);
  const displayName = profile.display_name || `@${profile.username}`;
  const initial = (displayName[0] ?? "?").toUpperCase();
  const gradient = bannerGradient(profile.banner_theme);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: gradient,
          padding: 72,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Top row — brand + avatar/name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: -0.5,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "white",
                  color: "#0B0B0D",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                }}
              >
                B
              </div>
              BingeTrackr
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.15)",
                  border: "6px solid rgba(255,255,255,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 96,
                  fontWeight: 800,
                }}
              >
                {initial}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: 800,
                    letterSpacing: -2,
                    lineHeight: 1,
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    opacity: 0.8,
                    marginTop: 6,
                  }}
                >
                  @{profile.username}
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 48 }}>
            <Stat value={counts.shows.toLocaleString()} label="SHOWS" />
            <Stat value={counts.episodes.toLocaleString()} label="EPISODES" />
            <Stat value={counts.hours.toLocaleString()} label="HOURS" />
            <Stat value={counts.lists.toLocaleString()} label="LISTS" />
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 3,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bannerGradient("mono"),
        color: "white",
        fontFamily: "sans-serif",
        fontSize: 96,
        fontWeight: 800,
        letterSpacing: -2,
      }}
    >
      BingeTrackr
    </div>
  );
}
