import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY for catalogue writes
 * (upserting into media, seasons, episodes, watch_providers_cache) and other
 * server-side maintenance. NEVER import from a "use client" file. The
 * `server-only` import at the top will error at build time if you do.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase admin env vars (SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
