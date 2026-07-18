"use client";

import Image from "next/image";
import Link from "next/link";
import { GripVertical, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { posterUrl } from "@/lib/tmdb/client";
import {
  assignTierAction,
  removeTierAction,
  resetTierBoardAction,
  type TierKey,
} from "@/lib/tracking/actions";
import type { TierBoardData, TierBoardItem } from "@/lib/tracking/queries";
import { EditableTierLabel } from "./EditableTierLabel";

const TIERS: TierKey[] = ["S", "A", "B", "C", "D"];

const TIER_COLORS: Record<TierKey, { bg: string; ink: string }> = {
  S: { bg: "linear-gradient(135deg,#d9a441,#c8862a)", ink: "#1a1208" },
  A: { bg: "linear-gradient(135deg,#e0653f,#c2452a)", ink: "#ffffff" },
  B: { bg: "linear-gradient(135deg,#3f7fb0,#2c5d86)", ink: "#ffffff" },
  C: { bg: "linear-gradient(135deg,#4a4a52,#34343a)", ink: "#ffffff" },
  D: { bg: "linear-gradient(135deg,#2a2a30,#1c1c20)", ink: "#cfcfd6" },
};

type Props = {
  initial: TierBoardData;
};

/**
 * The whole board. Owns local state so drag/drop + tap-to-assign feel
 * instant. Server state syncs in via useEffect on the initial prop.
 */
export function TierBoard({ initial }: Props) {
  const [items, setItems] = useState<TierBoardItem[]>(initial.items);
  const [labels, setLabels] = useState<Record<TierKey, string>>(initial.labels);
  const [, startTransition] = useTransition();

  // Reconcile with server after any revalidate.
  useEffect(() => {
    setItems(initial.items);
    setLabels(initial.labels);
  }, [initial.items, initial.labels]);

  const moveTo = (mediaId: string, targetTier: TierKey | null) => {
    setItems((prev) =>
      prev.map((it) =>
        it.mediaId === mediaId ? { ...it, tier: targetTier } : it,
      ),
    );
    startTransition(async () => {
      if (targetTier) {
        await assignTierAction({ mediaId, tier: targetTier });
      } else {
        await removeTierAction(mediaId);
      }
    });
  };

  const reset = () => {
    if (!items.some((it) => it.tier)) return;
    setItems((prev) => prev.map((it) => ({ ...it, tier: null })));
    startTransition(async () => {
      await resetTierBoardAction();
    });
  };

  const renameLabel = (tier: TierKey, label: string) => {
    setLabels((prev) => ({ ...prev, [tier]: label }));
  };

  const rankedCount = items.filter((it) => it.tier).length;
  const unranked = items.filter((it) => it.tier === null);

  if (items.length === 0) {
    return <EmptyBoard />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-body">
          {rankedCount} of {items.length} ranked
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={rankedCount === 0}
          >
            <Undo2 className="w-4 h-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* Tier rows */}
      <div className="flex flex-col gap-2">
        {TIERS.map((tier) => (
          <TierRow
            key={tier}
            tier={tier}
            label={labels[tier]}
            items={items.filter((it) => it.tier === tier)}
            onDrop={(mediaId) => moveTo(mediaId, tier)}
            onLabelChange={(next) => renameLabel(tier, next)}
            onItemAssign={moveTo}
          />
        ))}
      </div>

      {/* Unranked */}
      <UnrankedTray
        items={unranked}
        onDrop={(mediaId) => moveTo(mediaId, null)}
        onItemAssign={moveTo}
      />
    </div>
  );
}

// ─── Tier row ─────────────────────────────────────────────────────────────

function TierRow({
  tier,
  label,
  items,
  onDrop,
  onLabelChange,
  onItemAssign,
}: {
  tier: TierKey;
  label: string;
  items: TierBoardItem[];
  onDrop: (mediaId: string) => void;
  onLabelChange: (next: string) => void;
  onItemAssign: (mediaId: string, tier: TierKey | null) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const color = TIER_COLORS[tier];

  return (
    <div
      className="flex overflow-hidden"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Colored letter cell */}
      <div
        className="flex items-center justify-center w-16 sm:w-24 shrink-0"
        style={{ background: color.bg, color: color.ink, minHeight: 100 }}
      >
        <EditableTierLabel
          tier={tier}
          label={label}
          onLocalChange={onLabelChange}
        />
      </div>

      {/* Drop zone / posters */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const mediaId = e.dataTransfer.getData("text/plain");
          if (mediaId) onDrop(mediaId);
        }}
        className="flex-1 p-2 min-h-[100px] transition"
        style={{
          background: isOver ? "var(--surface2)" : "var(--surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {items.length === 0 ? (
          <p className="text-xs text-meta italic h-full flex items-center px-2">
            Drop a poster here — or tap any poster below to place it.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <TierPoster
                key={item.mediaId}
                item={item}
                onAssign={onItemAssign}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unranked tray ────────────────────────────────────────────────────────

function UnrankedTray({
  items,
  onDrop,
  onItemAssign,
}: {
  items: TierBoardItem[];
  onDrop: (mediaId: string) => void;
  onItemAssign: (mediaId: string, tier: TierKey | null) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
          Unranked
        </h2>
        <p className="text-xs text-meta">{items.length}</p>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const mediaId = e.dataTransfer.getData("text/plain");
          if (mediaId) onDrop(mediaId);
        }}
        className="p-3 transition"
        style={{
          background: isOver ? "var(--surface2)" : "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          minHeight: 120,
        }}
      >
        {items.length === 0 ? (
          <p className="text-sm text-meta italic px-2 py-4 text-center">
            Everything you&apos;ve watched is ranked. Watch more to fill this
            up.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <TierPoster
                key={item.mediaId}
                item={item}
                onAssign={onItemAssign}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Poster chip ──────────────────────────────────────────────────────────

function TierPoster({
  item,
  onAssign,
}: {
  item: TierBoardItem;
  onAssign: (mediaId: string, tier: TierKey | null) => void;
}) {
  const poster = posterUrl(item.posterPath, "w185");

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.mediaId);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="relative cursor-grab active:cursor-grabbing group"
      style={{ touchAction: "none" }}
      title={item.title}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="block overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              width: 60,
              height: 90,
              borderRadius: "calc(var(--radius-input) - 2px)",
              boxShadow: "var(--poster-shadow)",
            }}
            aria-label={`Rank ${item.title}`}
          >
            {poster ? (
              <Image
                src={poster}
                alt=""
                width={60}
                height={90}
                className="object-cover w-full h-full pointer-events-none"
              />
            ) : (
              <div
                className="w-full h-full grid place-items-center font-extrabold text-sm"
                style={{ background: "var(--bg2)", color: "var(--meta)" }}
              >
                {item.title[0]}
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="p-1 min-w-[160px]">
          <div
            className="px-2 py-1.5 text-xs font-semibold tracking-wider uppercase text-meta truncate"
            style={{ maxWidth: 200 }}
          >
            {item.title}
          </div>
          {(["S", "A", "B", "C", "D"] as TierKey[]).map((t) => {
            const isActive = item.tier === t;
            const c = TIER_COLORS[t];
            return (
              <DropdownMenuItem
                key={t}
                onClick={() => onAssign(item.mediaId, t)}
                className="flex items-center gap-2 py-1.5"
              >
                <span
                  aria-hidden
                  className="w-5 h-5 rounded grid place-items-center text-xs font-extrabold"
                  style={{ background: c.bg, color: c.ink }}
                >
                  {t}
                </span>
                <span className="flex-1">
                  Move to {t}
                  {isActive && (
                    <span className="text-meta text-xs ml-1">(current)</span>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
          {item.tier !== null && (
            <>
              <div className="my-1 h-px" style={{ background: "var(--border)" }} />
              <DropdownMenuItem
                onClick={() => onAssign(item.mediaId, null)}
                className="flex items-center gap-2 py-1.5"
                style={{ color: "var(--status-dropped)" }}
              >
                <Trash2 size={14} />
                <span>Remove from board</span>
              </DropdownMenuItem>
            </>
          )}
          {item.tmdbId && (
            <>
              <div className="my-1 h-px" style={{ background: "var(--border)" }} />
              <DropdownMenuItem asChild>
                <Link
                  href={`/title/${item.tmdbType}/${item.tmdbId}`}
                  className="flex items-center gap-2 py-1.5 text-sm"
                >
                  Open title page
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Grip affordance shown on hover (desktop) */}
      <span
        aria-hidden
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-70 transition pointer-events-none"
        style={{ color: "var(--meta)" }}
      >
        <GripVertical size={12} />
      </span>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────

function EmptyBoard() {
  return (
    <div
      className="glass p-8 flex flex-col items-start gap-3"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <p className="text-lg font-semibold">Nothing to rank yet.</p>
      <p className="text-sm text-body max-w-md">
        Movies you mark watched and shows you make progress on show up here as
        unranked posters. Drop them into S / A / B / C / D bands to build your
        personal tier list.
      </p>
      <Button asChild className="mt-2">
        <Link href="/discover">Find something to watch</Link>
      </Button>
    </div>
  );
}
