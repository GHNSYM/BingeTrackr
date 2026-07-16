"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setShowStatusAction,
  type ShowStatus,
} from "@/lib/tracking/actions";

const OPTIONS: {
  key: ShowStatus;
  label: string;
  cssVar: string;
}[] = [
  { key: "watching", label: "Watching", cssVar: "var(--status-watching)" },
  { key: "paused", label: "Paused", cssVar: "var(--status-paused)" },
  { key: "completed", label: "Completed", cssVar: "var(--status-completed)" },
  { key: "dropped", label: "Dropped", cssVar: "var(--status-dropped)" },
];

type Props = {
  mediaId: string;
  initialStatus: ShowStatus | null;
};

export function StatusPicker({ mediaId, initialStatus }: Props) {
  const [status, setStatus] = useState<ShowStatus | null>(initialStatus);
  const [pending, startTransition] = useTransition();

  const change = (next: ShowStatus) => {
    if (next === status) return;
    setStatus(next);
    startTransition(async () => {
      await setShowStatusAction({ mediaId, status: next });
    });
  };

  const current = OPTIONS.find((o) => o.key === status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring hover:brightness-110 transition disabled:opacity-70"
        style={{
          background: "var(--secondary)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        }}
      >
        <span
          aria-hidden
          className="w-2 h-2 rounded-full"
          style={{ background: current?.cssVar ?? "var(--meta)" }}
        />
        <span>{current?.label ?? "Set status"}</span>
        <ChevronDown
          size={14}
          aria-hidden
          style={{ color: "var(--meta)" }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[168px] p-1"
      >
        {OPTIONS.map((o) => {
          const isActive = o.key === status;
          return (
            <DropdownMenuItem
              key={o.key}
              onClick={() => change(o.key)}
              className="flex items-center gap-2.5 py-2 px-2 rounded-md cursor-pointer text-sm"
            >
              <span
                aria-hidden
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: o.cssVar }}
              />
              <span className="flex-1">{o.label}</span>
              {isActive && (
                <Check
                  size={14}
                  aria-hidden
                  style={{ color: "var(--foreground)" }}
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
