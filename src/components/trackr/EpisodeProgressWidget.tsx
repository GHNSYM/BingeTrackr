import Link from "next/link";
import type { ShowProgress } from "@/lib/tracking/actions";
import type { EpisodeRow as EpisodeRowType } from "@/lib/tmdb/seasons";
import type { TmdbTvSeasonSummary } from "@/lib/tmdb/client";
import { EpisodeRow } from "./EpisodeRow";
import { SeasonMarkAllButton } from "./SeasonMarkAllButton";
import { StatusPicker } from "./StatusPicker";

type Props = {
  mediaId: string;
  totalEpisodes: number;
  totalWatched: number;
  progress: ShowProgress | null;
  allSeasons: TmdbTvSeasonSummary[];
  currentSeasonNumber: number;
  currentSeasonEpisodes: EpisodeRowType[];
  watchedEpisodeIds: Set<string>;
  tmdbTvId: number | string;
};

/**
 * Founding feature UI. Server component owns the data fetch; child rows
 * are client components for optimistic mark/unmark.
 *
 * Layout:
 *   [ Progress card — X/Y episodes, %, status picker, resume line ]
 *   [ Season chips: S1 · S2 · S3 ... ]
 *   [ Episode list for the selected season ]
 */
export function EpisodeProgressWidget({
  mediaId,
  totalEpisodes,
  totalWatched,
  progress,
  allSeasons,
  currentSeasonNumber,
  currentSeasonEpisodes,
  watchedEpisodeIds,
  tmdbTvId,
}: Props) {
  const pct = totalEpisodes > 0
    ? Math.round((totalWatched / totalEpisodes) * 100)
    : 0;
  // Filter TMDB "specials" (season 0) from the nav — they clutter the row.
  const realSeasons = allSeasons.filter((s) => s.season_number > 0);

  return (
    <section className="flex flex-col gap-6">
      {/* Progress card */}
      <div className="glass p-5" style={{ borderRadius: "var(--radius-card)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
              Your progress
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {totalWatched} / {totalEpisodes} episodes
              <span
                className="text-lg font-semibold ml-2"
                style={{ color: "var(--meta)" }}
              >
                {pct}%
              </span>
            </p>
          </div>
          <StatusPicker mediaId={mediaId} initialStatus={progress?.status ?? null} />
        </div>

        {/* Solid progress bar */}
        <div
          className="h-2 rounded-full mt-4 overflow-hidden"
          style={{ background: "var(--border)" }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: "var(--primary)",
            }}
          />
        </div>

        {/* Resume line */}
        {progress?.current_episode ? (
          <p className="text-sm mt-4" style={{ color: "var(--body)" }}>
            Last watched:{" "}
            <span className="font-semibold text-foreground">
              S{progress.current_season} · E{progress.current_episode}
            </span>
            . Tap any episode below to log more.
          </p>
        ) : (
          <p className="text-sm mt-4" style={{ color: "var(--body)" }}>
            You haven&apos;t started this show yet. Tap an episode below to begin.
          </p>
        )}
      </div>

      {/* Season chips */}
      {realSeasons.length > 1 && (
        <nav aria-label="Seasons" className="flex gap-2 flex-wrap">
          {realSeasons.map((s) => {
            const isActive = s.season_number === currentSeasonNumber;
            return (
              <Link
                key={s.season_number}
                href={`/title/tv/${tmdbTvId}?s=${s.season_number}`}
                scroll={false}
                className="px-4 py-1.5 text-sm font-semibold rounded-full transition"
                style={{
                  background: isActive ? "var(--accent)" : "var(--secondary)",
                  color: isActive ? "var(--accent-ink)" : "var(--body)",
                }}
              >
                S{s.season_number}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Episode list */}
      <div
        className="flex flex-col gap-1 rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: 8,
        }}
      >
        <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1 flex-wrap">
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            Season {currentSeasonNumber} · {currentSeasonEpisodes.length} episodes
          </p>
          <SeasonMarkAllButton
            mediaId={mediaId}
            seasonNumber={currentSeasonNumber}
            totalInSeason={currentSeasonEpisodes.length}
            watchedInSeason={
              currentSeasonEpisodes.filter((ep) =>
                watchedEpisodeIds.has(ep.id),
              ).length
            }
          />
        </div>
        {currentSeasonEpisodes.map((ep) => (
          <EpisodeRow
            key={ep.id}
            mediaId={mediaId}
            episodeId={ep.id}
            seasonNumber={currentSeasonNumber}
            episodeNumber={ep.episode_number}
            title={ep.name}
            runtimeMinutes={ep.runtime_minutes}
            initiallyWatched={watchedEpisodeIds.has(ep.id)}
          />
        ))}
        {currentSeasonEpisodes.length === 0 && (
          <p
            className="px-4 py-6 text-sm text-center"
            style={{ color: "var(--meta)" }}
          >
            No episodes released yet for this season.
          </p>
        )}
      </div>
    </section>
  );
}
