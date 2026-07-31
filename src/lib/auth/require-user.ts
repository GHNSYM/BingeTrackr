import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";
import { PLACEHOLDER_USERNAME_REGEX } from "@/types/db";

/**
 * Redirect to /login if not signed in. Returns the user.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Get user + profile in one shot. Returns nulls if not signed in.
 *
 * Wrapped in React's cache() so multiple callers within the same render
 * pass — e.g. (app)/layout.tsx and the page component inside it — share
 * a single profile read. The auth round-trip itself is shared even more
 * widely, because it goes through the cached `getCurrentUser`.
 */
export const getUserAndProfile = cache(async (): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> => {
  const user = await getCurrentUser();
  if (!user) return { user: null, profile: null };

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { user, profile };
});

/**
 * Redirect to /login if not signed in, or /onboarding if the profile
 * still has the placeholder username from the auto-profile trigger.
 */
export async function requireOnboardedUser() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (!profile || PLACEHOLDER_USERNAME_REGEX.test(profile.username)) {
    redirect("/onboarding");
  }
  return { user, profile };
}
