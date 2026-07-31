import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/trackr/ShareButton";
import { getCurrentUser } from "@/lib/auth/current-user";
import { posterUrl } from "@/lib/tmdb/client";
import {
  bannerGradient,
  getProfileByUsername,
  getPublicListsByUser,
  getPublicProfileCounts,
  getRecentActivity,
  type ActivityItem,
  type PublicListSummary,
  type PublicProfileCounts,
} from "@/lib/tracking/queries";
import type { Profile } from "@/types/db";

type PageParams = Promise<{ username: string }>;

// ─── Metadata (OG preview when shared) ─────────────────────────────────────

export async function generateMetadata({ params }: { params: PageParams }) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Profile — BingeTrackr" };

  const displayName = profile.display_name || `@${profile.username}`;
  const description =
    profile.bio ??
    `${displayName}'s watchlist, tier list, and stats on BingeTrackr.`;

  return {
    title: `${displayName} — BingeTrackr`,
    description,
    openGraph: {
      title: displayName,
      description,
      type: "profile",
    },
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: PageParams;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  // Owner check — private profiles are 404 for everyone else.
  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === profile.id;
  if (!profile.is_public && !isOwner) notFound();

  const [counts, activity, publicLists] = await Promise.all([
    getPublicProfileCounts(profile.id),
    getRecentActivity(profile.id, 12),
    getPublicListsByUser(profile.id),
  ]);

  return (
    <main className="flex-1 flex flex-col">
      <Banner theme={profile.banner_theme} />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 -mt-16 relative z-10 flex flex-col gap-8 pb-16">
        <IdentityBlock
          profile={profile}
          isOwner={isOwner}
        />
        <CountsRow counts={counts} />
        {activity.length > 0 && <ActivitySection items={activity} />}
        {publicLists.length > 0 && <PublicListsSection lists={publicLists} />}
        {activity.length === 0 && (
          <EmptyProfile isOwner={isOwner} username={profile.username} />
        )}
      </div>
    </main>
  );
}

// ─── Banner ────────────────────────────────────────────────────────────────

function Banner({ theme }: { theme: string | null }) {
  return (
    <div
      className="w-full h-40 sm:h-56 shrink-0"
      style={{ background: bannerGradient(theme) }}
      aria-hidden
    />
  );
}

// ─── Identity ──────────────────────────────────────────────────────────────

function IdentityBlock({
  profile,
  isOwner,
}: {
  profile: Profile;
  isOwner: boolean;
}) {
  const displayName = profile.display_name ?? `@${profile.username}`;
  const initial = (displayName[0] ?? "?").toUpperCase();

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end -mt-4 sm:-mt-0">
      <div
        className="w-24 h-24 sm:w-32 sm:h-32 rounded-full grid place-items-center text-4xl sm:text-5xl font-extrabold shrink-0"
        style={{
          background: "var(--bg2)",
          border: "4px solid var(--bg)",
          color: "var(--foreground)",
          boxShadow: "var(--shadow)",
        }}
        aria-hidden
      >
        {initial}
      </div>

      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {displayName}
          </h1>
          <PublicPill isPublic={profile.is_public} />
        </div>
        <p className="text-body text-sm">@{profile.username}</p>
        {profile.bio && (
          <p className="text-body text-sm max-w-lg">{profile.bio}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ShareButton url={`/u/${profile.username}`} label="Share" />
        {isOwner && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/home">Home</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function PublicPill({ isPublic }: { isPublic: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{
        background: "var(--secondary)",
        border: "1px solid var(--border)",
        color: "var(--body)",
      }}
    >
      <span
        aria-hidden
        className="w-2 h-2 rounded-full"
        style={{
          background: isPublic ? "var(--status-completed)" : "var(--meta)",
        }}
      />
      {isPublic ? "Public" : "Private"}
    </span>
  );
}

// ─── Counts row ────────────────────────────────────────────────────────────

function CountsRow({ counts }: { counts: PublicProfileCounts }) {
  const items = [
    { label: "Shows", value: counts.shows },
    { label: "Episodes", value: counts.episodes },
    { label: "Hours", value: counts.hours },
    { label: "Lists", value: counts.lists },
  ];
  return (
    <div
      className="glass p-5 grid grid-cols-4 gap-2 sm:gap-4"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-0.5 items-center sm:items-start">
          <p className="text-xl sm:text-3xl font-extrabold tabular-nums leading-none">
            {it.value.toLocaleString()}
          </p>
          <p className="text-[10px] sm:text-xs font-semibold tracking-[0.15em] uppercase text-meta">
            {it.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Recent activity ───────────────────────────────────────────────────────

function ActivitySection({ items }: { items: ActivityItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        Recent activity
      </h2>
      <div
        className="glass flex flex-col divide-y"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {items.map((item, idx) => (
          <ActivityRow key={`${item.mediaId}-${idx}`} item={item} />
        ))}
      </div>
    </section>
  );
}

/**
 * "S1 · E1–E6" for a binge, "S1 · E4 · Episode name" for a single watch.
 *
 * A gappy group (E1, E3, E7) reports the count as well as the span, because
 * "E1–E7" alone would claim seven episodes were watched when three were.
 */
function episodeLabel(ep: NonNullable<ActivityItem["episodes"]>): string {
  const { count, firstSeason, firstEpisode, lastSeason, lastEpisode } = ep;

  if (count === 1) {
    return `S${firstSeason} · E${firstEpisode}${
      ep.singleName ? ` · ${ep.singleName}` : ""
    }`;
  }

  const plural = `${count} episodes`;

  // Spans seasons — spell both out rather than implying one range.
  if (firstSeason !== lastSeason) {
    return `S${firstSeason} E${firstEpisode} – S${lastSeason} E${lastEpisode} · ${plural}`;
  }

  if (ep.contiguous) {
    return `S${firstSeason} · E${firstEpisode}–E${lastEpisode}`;
  }

  return `S${firstSeason} · E${firstEpisode}–E${lastEpisode} · ${plural}`;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const poster = posterUrl(item.posterPath, "w185");
  const href = item.tmdbId
    ? `/title/${item.tmdbType}/${item.tmdbId}`
    : "#";
  const when = relativeTime(item.watchedAt);
  const meta = item.episodes ? episodeLabel(item.episodes) : "Movie";

  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 hover:bg-secondary transition first:rounded-t-2xl last:rounded-b-2xl"
    >
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: 40,
          height: 60,
          borderRadius: "var(--radius-input)",
          boxShadow: "var(--poster-shadow)",
        }}
      >
        {poster ? (
          <Image
            src={poster}
            alt={item.title}
            width={40}
            height={60}
            className="object-cover w-full h-full"
          />
        ) : (
          <div
            className="w-full h-full grid place-items-center font-bold"
            style={{ background: "var(--bg2)", color: "var(--meta)" }}
          >
            {item.title[0]}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-meta">{when}</p>
        <p className="font-semibold truncate">{item.title}</p>
        <p className="text-xs text-meta truncate">{meta}</p>
      </div>
    </Link>
  );
}

// ─── Public lists ──────────────────────────────────────────────────────────

function PublicListsSection({ lists }: { lists: PublicListSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
        Public lists
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {lists.map((list) => (
          <div
            key={list.id}
            className="glass p-4 flex gap-4"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <ListCoverMosaic posters={list.coverPosters} title={list.name} />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p className="font-semibold truncate">{list.name}</p>
              <p className="text-xs text-meta">{list.itemCount} items</p>
              {list.description && (
                <p className="text-xs text-body line-clamp-2 mt-1">
                  {list.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ListCoverMosaic({
  posters,
  title,
}: {
  posters: (string | null)[];
  title: string;
}) {
  const four = [...posters];
  while (four.length < 4) four.push(null);
  return (
    <div
      className="shrink-0 grid grid-cols-2 gap-0.5 overflow-hidden"
      style={{
        width: 80,
        height: 80,
        borderRadius: "var(--radius-input)",
        background: "var(--bg2)",
      }}
      aria-hidden
    >
      {four.slice(0, 4).map((p, i) => {
        const src = posterUrl(p, "w185");
        return src ? (
          <Image
            key={i}
            src={src}
            alt=""
            width={40}
            height={40}
            className="object-cover w-full h-full"
          />
        ) : (
          <div
            key={i}
            className="w-full h-full grid place-items-center text-xs font-bold"
            style={{ background: "var(--bg2)", color: "var(--meta)" }}
          >
            {title[i] ?? ""}
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyProfile({
  isOwner,
  username,
}: {
  isOwner: boolean;
  username: string;
}) {
  return (
    <div
      className="glass p-8 flex flex-col gap-3 items-start"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">
        {isOwner ? "Nothing to show yet." : `@${username} hasn't logged anything yet.`}
      </p>
      <p className="text-sm text-body max-w-md">
        {isOwner
          ? "Mark movies watched or start a show — activity shows up here for anyone who visits your profile."
          : "Check back later — profiles fill in as people mark things watched."}
      </p>
      {isOwner && (
        <Button asChild className="mt-2">
          <Link href="/discover">Find something to watch</Link>
        </Button>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
