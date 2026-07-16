import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { requireOnboardedUser } from "@/lib/auth/require-user";

export default async function HomePage() {
  const { profile } = await requireOnboardedUser();

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-widest uppercase text-meta">
            You&apos;re in
          </p>
          <h1 className="text-5xl font-extrabold tracking-tight leading-none">
            Hey, @{profile.username}.
          </h1>
          <p className="text-body max-w-md mt-2">
            Auth works end-to-end. Next up: real Home with Continue Watching,
            Library, Discover, and the Title Detail page.
          </p>
        </div>

        <div className="glass rounded-2xl p-5 flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-widest uppercase text-meta">
            Session
          </p>
          <p className="text-sm text-body">
            Logged in as{" "}
            <span className="text-foreground font-medium">@{profile.username}</span>
            . Profile{" "}
            <span className="text-foreground font-medium">
              {profile.is_public ? "public" : "private"}
            </span>
            . Region{" "}
            <span className="text-foreground font-medium">
              {profile.region ?? "IN"}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/discover">Discover</Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
