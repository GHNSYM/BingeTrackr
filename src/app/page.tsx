import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-2xl flex flex-col gap-12">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold"
          >
            B
          </div>
          <span className="text-xl font-semibold tracking-tight">BingeTrackr</span>
        </div>

        <div className="flex flex-col gap-5">
          <p className="text-meta text-xs font-semibold tracking-[0.15em] uppercase">
            Never lose your place again
          </p>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[1.02]">
            Track every movie, show and anime.
          </h1>
          <p className="text-body text-lg max-w-lg leading-relaxed">
            Bollywood to Busan to shonen. Resume any episode, rank your favourites,
            and never rewatch a season by accident again.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl border border-border text-foreground font-semibold hover:bg-secondary transition"
          >
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
