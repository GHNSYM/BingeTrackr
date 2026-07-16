import { requireOnboardedUser } from "@/lib/auth/require-user";

/**
 * Auth guard for every authed route under (app)/.
 * Redirects to /login if not signed in, or /onboarding if the profile still
 * has the placeholder username from the auto-profile trigger.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOnboardedUser();
  return <>{children}</>;
}
