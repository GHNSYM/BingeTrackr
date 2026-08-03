import Link from "next/link";
import { BackToLanding } from "@/components/trackr/BackToLanding";
import { BrandMark } from "@/components/trackr/BrandMark";
import { ForgotPasswordForm } from "@/components/trackr/ForgotPasswordForm";

export const metadata = { title: "Reset your password — BingeTrackr" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <BackToLanding />

      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <BrandMark size={44} className="mx-auto mb-2" />
          <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-meta text-sm">
            We&apos;ll email you a link to set a new one.
          </p>
        </div>

        <div
          className="glass p-6 flex flex-col gap-6"
          style={{ borderRadius: "var(--radius-hero)" }}
        >
          <ForgotPasswordForm />
        </div>

        <p className="text-center text-sm text-meta">
          Remembered it after all?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
