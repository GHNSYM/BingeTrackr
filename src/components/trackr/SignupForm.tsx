"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AuthAlert } from "@/components/trackr/AuthAlert";
import { PasswordInput } from "@/components/trackr/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/lib/auth/actions";

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, null);
  // Controlled only so the already-registered CTA below can link to /login
  // with the same address already filled in — the field itself doesn't need
  // to be controlled for the form to work.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="At least 6 characters"
        />
      </div>

      {/*
        The already-registered case gets its own CTA rather than sharing the
        plain error alert — a flat red line reads identically whether the
        problem is "bad email" or "you already have an account", and the
        second one has an obvious next step worth surfacing directly.
      */}
      {state?.alreadyRegistered ? (
        <div
          className="flex flex-col gap-2.5 px-3.5 py-3 rounded-lg text-sm"
          style={{ background: "var(--secondary)" }}
        >
          <p className="text-body">
            An account already exists for{" "}
            <span className="font-semibold text-foreground">{email}</span>.
          </p>
          <Button asChild size="sm" className="self-start">
            <Link href={`/login?email=${encodeURIComponent(email)}`}>
              Log in instead
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}
          {state?.message && (
            <AuthAlert variant="success">{state.message}</AuthAlert>
          )}
        </>
      )}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Creating account…" : "Sign up"}
      </Button>
    </form>
  );
}
