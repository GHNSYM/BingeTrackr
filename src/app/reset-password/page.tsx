import Link from "next/link";
import { BackToLanding } from "@/components/trackr/BackToLanding";
import { AuthAlert } from "@/components/trackr/AuthAlert";
import { BrandMark } from "@/components/trackr/BrandMark";
import { ResetPasswordForm } from "@/components/trackr/ResetPasswordForm";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata = { title: "Set a new password — BingeTrackr" };

/**
 * Reached only via the recovery email's link, which `/auth/callback`
 * exchanges for a session before redirecting here (see
 * `requestPasswordResetAction`). No session means that exchange never
 * happened — an expired/already-used link, or someone landing here cold —
 * which is a distinct, explicit state, not a password-form error.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <BackToLanding />

      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <BrandMark size={44} className="mx-auto mb-2" />
          <h1 className="text-3xl font-bold tracking-tight">
            {user ? "Set a new password" : "Link expired"}
          </h1>
          {!user && (
            <p className="text-meta text-sm">
              This reset link is invalid or has already been used.
            </p>
          )}
        </div>

        {user ? (
          <div
            className="glass p-6 flex flex-col gap-6"
            style={{ borderRadius: "var(--radius-hero)" }}
          >
            <ResetPasswordForm />
          </div>
        ) : (
          <div
            className="glass p-6 flex flex-col gap-4"
            style={{ borderRadius: "var(--radius-hero)" }}
          >
            <AuthAlert variant="error">
              Reset links only work once and expire after a while. Request a
              fresh one below.
            </AuthAlert>
            <Button asChild>
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-meta">
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
