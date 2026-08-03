"use client";

import { useActionState } from "react";
import { AuthAlert } from "@/components/trackr/AuthAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "@/lib/auth/actions";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    null,
  );

  // Once the email is sent there's nothing left to submit — showing the form
  // again invites a confusing second click that just re-sends the same link.
  if (state?.message) {
    return <AuthAlert variant="success">{state.message}</AuthAlert>;
  }

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
          autoFocus
          placeholder="you@example.com"
        />
      </div>

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
