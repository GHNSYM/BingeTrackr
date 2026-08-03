import Link from "next/link";
import { BackToLanding } from "@/components/trackr/BackToLanding";
import { BrandMark } from "@/components/trackr/BrandMark";
import { LoginForm } from "@/components/trackr/LoginForm";

export const metadata = { title: "Log in — BingeTrackr" };

type SearchParams = Promise<{ email?: string }>;

/**
 * Server wrapper so `?email=` (from the signup form's "you already have an
 * account" CTA) can be read without a client-side `useSearchParams()` —
 * that hook needs a Suspense boundary to avoid de-opting the whole page, and
 * there's nothing else here that needs the client until `LoginForm`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <BackToLanding />

      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <BrandMark size={44} className="mx-auto mb-2" />
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-meta text-sm">Pick up where you left off.</p>
        </div>

        <div
          className="glass p-6 flex flex-col gap-6"
          style={{ borderRadius: "var(--radius-hero)" }}
        >
          <LoginForm initialEmail={email} />
        </div>

        <p className="text-center text-sm text-meta">
          New here?{" "}
          <Link href="/signup" className="text-foreground underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
