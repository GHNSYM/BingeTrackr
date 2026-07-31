"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; message?: string } | null;

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
