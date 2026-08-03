"use client";

import { useActionState } from "react";
import { AuthAlert } from "@/components/trackr/AuthAlert";
import { PasswordInput } from "@/components/trackr/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={6}
          autoFocus
          placeholder="At least 6 characters"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Type it again"
        />
      </div>

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
