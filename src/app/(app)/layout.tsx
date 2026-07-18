import { AppShell } from "@/components/trackr/AppShell";
import { requireOnboardedUser } from "@/lib/auth/require-user";

/**
 * Auth guard + app shell. Every authed route under (app)/ automatically
 * gets the sidebar (desktop) / bottom tab bar (mobile) chrome.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireOnboardedUser();
  return (
    <AppShell
      username={profile.username}
      displayName={profile.display_name}
    >
      {children}
    </AppShell>
  );
}
