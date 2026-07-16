"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/lib/auth/actions";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signUpAction, null);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <div
            aria-hidden
            className="mx-auto w-11 h-11 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg mb-2"
          >
            B
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="text-meta text-sm">Free forever. No card, no ads.</p>
        </div>

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
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>

          {state?.error && (
            <p className="text-sm" style={{ color: "var(--status-dropped)" }}>
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="text-sm" style={{ color: "var(--status-completed)" }}>
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="mt-2">
            {isPending ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <p className="text-center text-sm text-meta">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
