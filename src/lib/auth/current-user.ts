import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, or null.
 *
 * `supabase.auth.getUser()` is a **network round-trip** — it validates the JWT
 * against Supabase Auth rather than decoding it locally. Every query helper
 * used to call it independently, which cost the title page 6 uncached
 * validations per render on top of the middleware's and the layout's.
 *
 * React's `cache()` memoises per request, so every helper in one render — or in
 * one server action — shares a single validation. This is the single primitive
 * every auth read goes through; `getUserAndProfile` and `requireUser` build on
 * it so a layout + page + N helpers still cost exactly one round-trip.
 *
 * Do NOT hoist the result to a module-level variable to "cache harder": module
 * scope is shared across requests on a warm serverless instance, so that would
 * leak one user's identity into another user's response.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
