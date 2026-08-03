import type { PosterSize } from "@/lib/poster-size";

type Props = {
  /** Read from the cookie server-side — see `POSTER_SIZE_COOKIE`. */
  size: PosterSize;
  /** Server-rendered controls that share the toolbar row (e.g. type pills). */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Wraps a grid view with `data-poster-size`; globals.css turns that into a
 * column count per breakpoint.
 *
 * No client state, no toggle: the size toggle now lives only in Settings
 * (`PosterSizeToggle`), which writes `POSTER_SIZE_COOKIE`. Every grid page
 * reads that cookie fresh on its own next server render — these are all
 * already-dynamic routes, so a change in Settings shows up on the very next
 * navigation with no cross-component wiring needed. This used to be a client
 * component holding its own copy of the size (so an inline toggle could resize
 * instantly without a round-trip); now that the toggle isn't inline, there's
 * nothing left that needs to run on the client.
 */
export function PosterSizeShell({ size, toolbar, children }: Props) {
  return (
    <div data-poster-size={size} className="flex flex-col gap-6">
      {toolbar && <div className="flex flex-wrap items-center gap-3">{toolbar}</div>}
      {children}
    </div>
  );
}
