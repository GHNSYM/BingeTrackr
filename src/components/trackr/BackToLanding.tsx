import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Fixed top-left "back to landing" link, shared by every pre-auth page
 * (login, signup, forgot/reset password). Positioned the same way the
 * landing page's own floating controls are (`--float-top`-style spacing) so
 * the two surfaces feel like one continuous flow rather than a jump between
 * unrelated layouts.
 *
 * Plain monochrome `.glass` — these are app/auth pages, not the marketing
 * page, so the landing's colour allowance doesn't apply here.
 */
export function BackToLanding() {
  return (
    <Link
      href="/"
      // `hover:brightness-110`, not `hover:bg-secondary`: `.glass` is an
      // unlayered rule, so it always wins the `background` property over a
      // Tailwind utility (which lives in a cascade layer) regardless of
      // specificity — that hover would compile fine and do nothing visible.
      className="glass fixed left-4 sm:left-6 z-50 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-medium hover:brightness-110 transition"
      style={{ top: "max(1rem, env(safe-area-inset-top))" }}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </Link>
  );
}
