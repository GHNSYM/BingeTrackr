import { cookies } from "next/headers";
import { Download, FileUp, Trash2 } from "lucide-react";
import { PosterSizeToggle } from "@/components/trackr/PosterSizeToggle";
import { PrivacyToggle } from "@/components/trackr/PrivacyToggle";
import { SettingsThemeToggle } from "@/components/trackr/SettingsThemeToggle";
import { requireOnboardedUser } from "@/lib/auth/require-user";
import { POSTER_SIZE_COOKIE, parsePosterSize } from "@/lib/poster-size";

export const metadata = { title: "Settings — BingeTrackr" };

/**
 * Reachable from both surfaces per the design handoff's Settings screen:
 * desktop via `UserChip`'s sidebar dropdown, mobile via the gear icon on the
 * profile page (the mobile tab bar has a fixed 4 tabs — Home/Library/
 * Discover/Profile — with no room of its own for a 5th, so Settings nests
 * under Profile instead, same as the handoff's mobile IA).
 *
 * Everything below is real EXCEPT the sections explicitly marked "Coming
 * soon" — Import, Data export, and Delete account. Those are genuinely
 * unbuilt, not hidden-because-broken, and say so rather than pretending
 * otherwise (same convention as the landing page's "Not yet" badge).
 */
export default async function SettingsPage() {
  const { profile } = await requireOnboardedUser();

  const cookieStore = await cookies();
  const posterSize = parsePosterSize(cookieStore.get(POSTER_SIZE_COOKIE)?.value);

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          Your account
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
          Settings
        </h1>
      </header>

      <SettingsSection title="Appearance">
        <SettingsRow
          label="Theme"
          description="Dark is the default across BingeTrackr. Switch any time."
        >
          <SettingsThemeToggle />
        </SettingsRow>
        <SettingsRow
          label="Poster size"
          description="Applies to Discover, Library and Home."
        >
          <PosterSizeToggle initial={posterSize} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          label="Profile visibility"
          description="Public profiles can be viewed by anyone at your link. Your watchlist stays private either way."
        >
          <PrivacyToggle initialIsPublic={profile.is_public} />
        </SettingsRow>
        <SettingsRow
          label="Region"
          description="Streaming availability and the catalogue are scoped to India."
        >
          <span className="text-sm font-semibold">🇮🇳 India</span>
        </SettingsRow>
        <SettingsRow
          label="Sign-in method"
          description="Google sign-in isn't wired up yet — email and password only for now."
        >
          <span className="text-sm font-semibold text-meta">Email &amp; password</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Import">
        <ComingSoonRow
          icon={FileUp}
          label="Letterboxd CSV"
          description="Bring your ratings and watch history over."
        />
        <ComingSoonRow
          icon={FileUp}
          label="Trakt JSON"
          description="Import your Trakt watch history."
        />
        <ComingSoonRow
          icon={FileUp}
          label="MAL XML"
          description="Import your MyAnimeList history."
        />
      </SettingsSection>

      <SettingsSection title="Data">
        <ComingSoonRow
          icon={Download}
          label="Export your data"
          description="Download everything you've tracked as a CSV."
        />
      </SettingsSection>

      <SettingsSection title="Danger zone" destructive>
        <ComingSoonRow
          icon={Trash2}
          label="Delete account"
          description="Permanently erase your account and everything in it."
          destructive
        />
      </SettingsSection>
    </main>
  );
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function SettingsSection({
  title,
  destructive = false,
  children,
}: {
  title: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className="text-xs font-semibold tracking-[0.15em] uppercase"
        style={{ color: destructive ? "var(--status-dropped)" : "var(--meta)" }}
      >
        {title}
      </h2>
      <div
        className="glass flex flex-col divide-y"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-body">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Honest placeholder for planned-but-unbuilt settings. Disabled rather than
 * omitted — the point is to show the real shape of the settings surface, per
 * the design handoff, without claiming any of these three actually work.
 */
function ComingSoonRow({
  icon: Icon,
  label,
  description,
  destructive = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 p-4 opacity-60" aria-disabled>
      <span
        className="shrink-0 w-9 h-9 rounded-lg grid place-items-center"
        style={{
          background: "var(--surface2)",
          color: destructive ? "var(--status-dropped)" : "var(--body)",
        }}
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-body">{description}</p>
      </div>
      <span
        className="shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold tracking-[0.1em] uppercase"
        style={{
          color: "var(--meta)",
          border: "1px solid var(--border)",
        }}
      >
        Coming soon
      </span>
    </div>
  );
}
