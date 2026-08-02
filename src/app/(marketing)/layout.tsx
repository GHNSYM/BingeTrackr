import { Caveat } from "next/font/google";

/**
 * Caveat — the handwriting face, used ONLY for the landing page's asides and
 * annotations (`.font-hand` in globals.css).
 *
 * Deliberately loaded in this layout rather than the root one. `AGENTS.md`
 * locks the app's type to Manrope + Inter; a third face on every authed route
 * would be a real regression on a cheap Android over 4G for zero benefit,
 * since nothing inside the app shell uses it. Scoped here, only `/` pays for
 * it — and `/` is the static route, so it's cached at the edge.
 *
 * Latin only: the handwritten bits are English asides. Indic copy falls back to
 * the system font per the handoff's typography note.
 */
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${caveat.variable} flex-1 flex flex-col`}>{children}</div>
  );
}
