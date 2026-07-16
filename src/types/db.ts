// Hand-authored types for now. When the schema stabilizes, replace with
// `supabase gen types typescript --linked > src/types/database.ts`.

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  region: string | null;
  banner_theme: string | null;
  created_at: string;
};

// Placeholder usernames look like "userAF12B8C9" (from the auto-profile trigger).
// If a profile still matches this, the user hasn't claimed a real handle yet.
export const PLACEHOLDER_USERNAME_REGEX = /^user[a-f0-9]{8}$/i;
