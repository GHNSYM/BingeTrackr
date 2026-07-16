import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { posterUrl } from "@/lib/tmdb/client";
import { getStats, type Stats } from "@/lib/tracking/queries";

export const metadata = { title: "Stats — BingeTrackr" };

export default async function StatsPage() {
  const stats = await getStats();
  const hasAnyData =
    stats.lifetime.moviesWatched + stats.lifetime.episodesWatched > 0;

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-4xl mx-auto w-full flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            Everything you&apos;ve watched
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            Stats
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/library">Library</Link>
        </Button>
      </header>

      {!hasAnyData ? (
        <EmptyStats />
      ) : (
        <>
          <LifetimeHero stats={stats} />
          <TilesRow stats={stats} />
          <ThisYearCard stats={stats} />
          <ByTypeSection stats={stats} />
          {stats.topShows.length > 0 && <TopShowsSection stats={stats} />}
          {stats.onThisDay.length > 0 && <OnThisDaySection stats={stats} />}
        </>
      )}
    </main>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────

function LifetimeHero({ stats }: { stats: Stats }) {
  const hours = Math.floor(stats.lifetime.totalMinutes / 60);
  const days = hours / 24;
  return (
    <section
      className="glass p-6 sm:p-8 flex flex-col gap-2"
      style={{ borderRadius: "var(--radius-hero)" }}
    >
      <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        Hours in your lifetime
      </p>
      <p className="text-6xl sm:text-8xl font-extrabold tracking-tight tabular-nums leading-none">
        {hours.toLocaleString()}
      </p>
      <p className="text-sm text-body mt-2">
        {days < 1
          ? "You've barely started — keep marking."
          : `About ${days.toFixed(1)} days of continuous watching.`}
      </p>
    </section>
  );
}

function TilesRow({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatTile label="Movies" value={stats.lifetime.moviesWatched} />
      <StatTile label="Episodes" value={stats.lifetime.episodesWatched} />
      <StatTile label="Shows completed" value={stats.lifetime.showsCompleted} />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="glass p-5 flex flex-col gap-1"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        {label}
      </p>
      <p className="text-3xl font-extrabold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function ThisYearCard({ stats }: { stats: Stats }) {
  const hours = Math.floor(stats.thisYear.totalMinutes / 60);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        This year — {stats.thisYear.year}
      </h2>
      <div
        className="glass p-5 flex items-baseline gap-4 flex-wrap"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <span className="text-4xl font-extrabold tracking-tight tabular-nums">
          {hours}h
        </span>
        <span className="text-body text-sm">
          {stats.thisYear.movies} movies · {stats.thisYear.episodes} episodes
        </span>
      </div>
    </section>
  );
}

function ByTypeSection({ stats }: { stats: Stats }) {
  const totalMinutes = stats.byType.movie + stats.byType.tv;
  if (totalMinutes === 0) return null;

  const rows = [
    { label: "TV & anime", minutes: stats.byType.tv },
    { label: "Movies", minutes: stats.byType.movie },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        By type
      </h2>
      <div
        className="glass p-5 flex flex-col gap-4"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {rows.map((r) => {
          const hours = Math.floor(r.minutes / 60);
          const pct = totalMinutes > 0 ? (r.minutes / totalMinutes) * 100 : 0;
          return (
            <div key={r.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{r.label}</span>
                <span className="text-meta tabular-nums">
                  {hours}h · {pct.toFixed(0)}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: "var(--primary)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TopShowsSection({ stats }: { stats: Stats }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        Most watched
      </h2>
      <div
        className="glass flex flex-col divide-y"
        style={{
          borderRadius: "var(--radius-card)",
        }}
      >
        {stats.topShows.map((s, i) => {
          const hours = Math.floor(s.minutes / 60);
          const poster = posterUrl(s.posterPath, "w185");
          const href = s.tmdbId ? `/title/tv/${s.tmdbId}` : "#";
          return (
            <Link
              key={s.mediaId}
              href={href}
              className="flex items-center gap-4 p-3 hover:bg-secondary transition first:rounded-t-2xl last:rounded-b-2xl"
            >
              <span
                className="text-lg font-extrabold text-meta w-6 tabular-nums shrink-0"
                aria-hidden
              >
                {i + 1}
              </span>
              <div
                className="shrink-0 overflow-hidden"
                style={{
                  width: 44,
                  height: 66,
                  borderRadius: "var(--radius-input)",
                  boxShadow: "var(--poster-shadow)",
                }}
              >
                {poster ? (
                  <Image
                    src={poster}
                    alt={s.title}
                    width={44}
                    height={66}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div
                    className="w-full h-full grid place-items-center font-bold"
                    style={{ background: "var(--bg2)", color: "var(--meta)" }}
                  >
                    {s.title[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{s.title}</p>
                <p className="text-xs text-meta">
                  {s.episodeCount} episodes · {hours}h
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OnThisDaySection({ stats }: { stats: Stats }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        On this day
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {stats.onThisDay.map((o, idx) => {
          const poster = posterUrl(o.posterPath, "w185");
          const href = o.tmdbId ? `/title/${o.tmdbType}/${o.tmdbId}` : "#";
          const yearLabel = `${o.yearsAgo} year${o.yearsAgo === 1 ? "" : "s"} ago`;
          return (
            <Link
              key={`${o.mediaId}-${idx}`}
              href={href}
              className="glass flex items-center gap-3 p-3 hover:brightness-110 transition"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div
                className="shrink-0 overflow-hidden"
                style={{
                  width: 44,
                  height: 66,
                  borderRadius: "var(--radius-input)",
                  boxShadow: "var(--poster-shadow)",
                }}
              >
                {poster ? (
                  <Image
                    src={poster}
                    alt={o.title}
                    width={44}
                    height={66}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div
                    className="w-full h-full grid place-items-center font-bold"
                    style={{ background: "var(--bg2)", color: "var(--meta)" }}
                  >
                    {o.title[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-meta">{yearLabel}</p>
                <p className="font-semibold truncate">{o.title}</p>
                <p className="text-xs text-meta">
                  {o.isEpisode ? "Watched an episode" : "Watched the movie"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EmptyStats() {
  return (
    <div
      className="glass p-8 flex flex-col gap-3 items-start"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">Nothing tracked yet.</p>
      <p className="text-body text-sm max-w-lg">
        Stats fill in as you mark movies and episodes watched. Come back once
        you have a few — hours watched, top shows, and &ldquo;on this
        day&rdquo; memories all live here.
      </p>
      <Button asChild className="mt-2">
        <Link href="/discover">Find something to watch</Link>
      </Button>
    </div>
  );
}
