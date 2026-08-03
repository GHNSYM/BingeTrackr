"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthAlert } from "@/components/trackr/AuthAlert";
import { PasswordInput } from "@/components/trackr/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/auth/actions";

type Props = {
  /** Pre-filled when arriving from the signup form's "you already have an
      account" CTA — from `/login?email=...`, read server-side in the page. */
  initialEmail?: string;
};

export function LoginForm({ initialEmail }: Props) {
  const [state, formAction, isPending] = useActionState(signInAction, null);

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
          defaultValue={initialEmail}
          // Rather than tap straight into the password field on autofocus —
          // arriving here pre-filled from signup means the email is already
          // right, so the password field is the one actually worth focusing.
          autoFocus={!initialEmail}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-meta hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          autoFocus={!!initialEmail}
        />
      </div>

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Signing in…" : "Log in"}
      </Button>
    </form>
  );
}
