import { AppShell } from "@/components/trackr/AppShell";
import { getUserAndProfile } from "@/lib/auth/require-user";
import { PLACEHOLDER_USERNAME_REGEX } from "@/types/db";

/**
 * /u/[username] is a PUBLIC route — anonymous visitors can view public
 * profiles. But when a signed-in user is looking at a profile (their own
 * or someone else's), we don't want them to lose the app navigation. So
 * we conditionally wrap in the AppShell.
 *
 * Anonymous visitors get no shell — the profile page's own CTA row
 * handles the "sign up to track" nudge.
 */
export default async function UsernameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getUserAndProfile();

  // Signed-in with a real (non-placeholder) handle → shell.
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

  // Anonymous or half-onboarded → bare page.
  return <>{children}</>;
}
