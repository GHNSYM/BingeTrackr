import { getUserAndProfile } from "@/lib/auth/require-user";
import { PLACEHOLDER_USERNAME_REGEX } from "@/types/db";
import { AppShell } from "./AppShell";

/**
 * Wraps children in the AppShell if the visitor is signed in with a real
 * (non-placeholder) handle. Anonymous visitors — and half-onboarded users —
 * get the bare page.
 *
 * Use in layouts of PUBLIC routes (e.g. /u/[username], /title/[type]/[id])
 * where signed-in users still expect the app chrome. Authed-only routes
 * (/(app)/*) should use AppShell directly via requireOnboardedUser.
 */
export async function ConditionalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getUserAndProfile();

  if (profile && !PLACEHOLDER_USERNAME_REGEX.test(profile.username)) {
    return (
      <AppShell
        username={profile.username}
        displayName={profile.display_name}
      >
        {children}
      </AppShell>
    );
  }

  return <>{children}</>;
}
