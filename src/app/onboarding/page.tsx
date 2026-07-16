"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkUsernameAvailable, claimUsernameAction } from "@/lib/auth/actions";

type AvailStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; reason: string };

const reasonLabel: Record<string, string> = {
  "too-short": "Too short",
  "too-long": "Too long",
  "invalid-chars": "Only a-z, 0-9, and _",
  reserved: "Reserved handle",
  taken: "Taken",
  error: "Couldn't check",
};

export default function OnboardingPage() {
  const [state, formAction, isPending] = useActionState(claimUsernameAction, null);
  const [handle, setHandle] = useState("");
  const [avail, setAvail] = useState<AvailStatus>({ kind: "idle" });
  const [, startTransition] = useTransition();

  // Debounced live availability check.
  useEffect(() => {
    if (handle.trim().length < 3) {
      setAvail({ kind: "idle" });
      return;
    }
    setAvail({ kind: "checking" });
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await checkUsernameAvailable(handle);
        if (result.ok) setAvail({ kind: "ok" });
        else setAvail({ kind: "bad", reason: result.reason });
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [handle]);

  const canSubmit = avail.kind === "ok" && !isPending;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 items-center">
            <span className="h-1.5 w-16 bg-primary rounded-full" />
            <span className="h-1.5 w-16 bg-border rounded-full" />
            <span className="h-1.5 w-16 bg-border rounded-full" />
          </div>
          <p className="text-xs font-semibold tracking-widest uppercase text-meta">
            Step 1 of 3
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Claim your handle
          </h1>
          <p className="text-body text-sm">
            This is your public profile — bingetrackr.app/u/
            <span className="text-foreground font-medium">
              {handle || "you"}
            </span>
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="sr-only">
              Username
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-meta text-lg">
                @
              </span>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={24}
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="yourname"
                className="pl-10 h-12 text-base font-medium"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm">
                {avail.kind === "checking" && (
                  <span className="text-meta">Checking…</span>
                )}
                {avail.kind === "ok" && (
                  <span style={{ color: "var(--status-completed)" }}>Available</span>
                )}
                {avail.kind === "bad" && (
                  <span style={{ color: "var(--status-dropped)" }}>
                    {reasonLabel[avail.reason] ?? "Unavailable"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {state?.error && (
            <p className="text-sm" style={{ color: "var(--status-dropped)" }}>
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={!canSubmit} className="mt-4 h-11">
            {isPending ? "Claiming…" : "Continue"}
          </Button>
        </form>
      </div>
    </main>
  );
}
