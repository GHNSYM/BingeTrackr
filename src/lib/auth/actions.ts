"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type ActionState = {
  error?: string;
  message?: string;
  /**
   * Set only by `signUpAction`, only when the submitted email already has a
   * CONFIRMED account. Lets the signup form swap its generic error styling for
   * a "you already have an account — log in instead" treatment, rather than a
   * plain red line that reads the same as "wrong password" or "bad email".
   */
  alreadyRegistered?: boolean;
} | null;

const RESERVED_HANDLES = new Set([
  "admin",
  "root",
  "bingetrackr",
  "binge",
  "trackr",
  "support",
  "help",
  "api",
  "auth",
  "login",
  "signup",
  "onboarding",
  "settings",
  "home",
  "discover",
  "library",
  "tiers",
  "stats",
  "forgot-password",
  "reset-password",
]);

// ─── Sign up ───────────────────────────────────────────────────────────────

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  /**
   * Supabase deliberately never says "this email is taken" via `error` — an
   * anti-enumeration protection, not a bug to route around. What it DOES do,
   * by documented design, is return the EXISTING user object with an empty
   * `identities` array when the email already has a CONFIRMED account — and
   * it sends no email at all in that case. This form used to ignore that
   * signal entirely and fall through to "Check your inbox…", which is why a
   * second signup attempt looked like it resent a confirmation code: nothing
   * was actually sent, the message just lied about it.
   *
   * `identities` is only empty for a CONFIRMED existing account. An existing
   * but unconfirmed signup (never clicked the original link) still has a real
   * identity, so THAT case correctly falls through below and gets a fresh
   * confirmation email — resending it there is the right behaviour, not this
   * bug.
   */
  const alreadyRegistered = !error && !!data.user && data.user.identities?.length === 0;

  if (alreadyRegistered) {
    // They may well have typed their real password out of habit — if so, just
    // let them in instead of making them retype everything on /login.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!signInError) {
      revalidatePath("/", "layout");
      redirect("/home");
    }
    return {
      error: "You already have an account with this email.",
      alreadyRegistered: true,
    };
  }

  if (error) return { error: error.message };

  // Email confirmation disabled → session issued immediately → straight to onboarding.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  // Otherwise the user needs to click the link in their inbox.
  return { message: `Check your inbox — we sent a confirmation link to ${email}.` };
}

// ─── Log in ────────────────────────────────────────────────────────────────

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/home");
}

// ─── Log out ───────────────────────────────────────────────────────────────

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ─── Forgot / reset password ───────────────────────────────────────────────

/**
 * Sends a password-reset email. Same anti-enumeration principle as `signUp`
 * above: Supabase resolves successfully whether or not the email has an
 * account (it just quietly sends nothing for an unknown one), so the message
 * is deliberately phrased as "if you have an account" rather than promising a
 * specific inbox got mail. An `error` here means a real infra failure (rate
 * limited, malformed request) — not "no such user".
 *
 * `redirectTo` reuses the exact same `/auth/callback` route the signup
 * confirmation link already goes through — it does a plain
 * `exchangeCodeForSession`, which works identically for a recovery link.
 * `next=/reset-password` is the only thing that differs.
 */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message };

  return {
    message: `If ${email} has a BingeTrackr account, we've sent a reset link.`,
  };
}

/**
 * Sets a new password. Requires an ACTIVE session — the one `/auth/callback`
 * established by exchanging the recovery link's code, not a fresh sign-in.
 * No session (expired link, link already used, or someone landing on this
 * page cold) surfaces as a Supabase error here; the page component also
 * checks for a session up front so that case renders as an explicit
 * "link expired" state rather than a confusing password-form error.
 */
export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/home");
}

// ─── Username availability + claim ─────────────────────────────────────────

type UsernameCheck =
  | { ok: true }
  | { ok: false; reason: "too-short" | "too-long" | "invalid-chars" | "reserved" | "taken" | "error" };

export async function checkUsernameAvailable(
  raw: string,
): Promise<UsernameCheck> {
  const username = raw.trim().toLowerCase();
  if (username.length < 3) return { ok: false, reason: "too-short" };
  if (username.length > 24) return { ok: false, reason: "too-long" };
  if (!/^[a-z0-9_]+$/.test(username)) return { ok: false, reason: "invalid-chars" };
  if (RESERVED_HANDLES.has(username)) return { ok: false, reason: "reserved" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (error) return { ok: false, reason: "error" };

  if (data) {
    // Their own placeholder row doesn't collide when they're claiming — but
    // this check runs BEFORE they claim, so we look up by target username.
    // If found, it's someone else's.
    const user = await getCurrentUser();
    if (user && data.id === user.id) return { ok: true }; // idempotent self-claim
    return { ok: false, reason: "taken" };
  }

  return { ok: true };
}

export async function claimUsernameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();

  const check = await checkUsernameAvailable(username);
  if (!check.ok) {
    return { error: reasonToMessage(check.reason) };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "You're not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/home");
}

// ─── Privacy ────────────────────────────────────────────────────────────────

export type ProfileActionResult = { ok: true } | { error: string };

/**
 * Toggle `profiles.is_public`. Called from Settings — a plain click-to-toggle,
 * not a `<form>`, so it returns the `{ok}|{error}` shape the tracking actions
 * use rather than the `useActionState`-flavoured `ActionState` the rest of this
 * file uses (those are all bound to actual form submissions).
 *
 * `profiles_update_own` RLS already restricts this to the row's owner; no
 * extra check needed here beyond confirming a session exists.
 *
 * Revalidates the profile page's layout, not just the page — the public/private
 * pill in `IdentityBlock` and the RLS-gated sections below it (activity, lists)
 * both need the fresh value.
 */
export async function setProfilePrivacyAction(
  isPublic: boolean,
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "not-signed-in" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/u/[username]", "layout");
  revalidatePath("/settings");
  return { ok: true };
}

function reasonToMessage(
  reason: "too-short" | "too-long" | "invalid-chars" | "reserved" | "taken" | "error",
) {
  switch (reason) {
    case "too-short":
      return "Handle must be at least 3 characters.";
    case "too-long":
      return "Handle must be 24 characters or fewer.";
    case "invalid-chars":
      return "Only lowercase letters, numbers, and underscores.";
    case "reserved":
      return "That handle is reserved.";
    case "taken":
      return "That handle is taken.";
    case "error":
      return "Couldn't check availability. Try again.";
  }
}
