import { TierBoard } from "@/components/trackr/TierBoard";
import { getTierBoard } from "@/lib/tracking/queries";

export const metadata = { title: "Tiers — BingeTrackr" };

export default async function TiersPage() {
  const board = await getTierBoard();

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          The flagship
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
          My tier list
        </h1>
        <p className="text-sm text-body max-w-lg mt-1">
          Drag any poster onto a band, or tap a poster to pick a tier. Click a
          band letter (S / A / …) to rename it. Only you can edit; anyone can
          see your list if your profile is public.
        </p>
      </header>

      <TierBoard initial={board} />
    </main>
  );
}
