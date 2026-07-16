"use client";

import { useState, useTransition } from "react";
import {
  setShowStatusAction,
  type ShowStatus,
} from "@/lib/tracking/actions";

const OPTIONS: { key: ShowStatus; label: string; cssVar: string }[] = [
  { key: "watching", label: "Watching", cssVar: "var(--status-watching)" },
  { key: "paused", label: "Paused", cssVar: "var(--status-paused)" },
  { key: "completed", label: "Completed", cssVar: "var(--status-completed)" },
  { key: "dropped", label: "Dropped", cssVar: "var(--status-dropped)" },
];

type Props = {
  mediaId: string;
  initialStatus: ShowStatus | null;
};

/**
 * Native <select> — simple, accessible, and mobile-native pickers on iOS/Android.
 * Fancy custom popover can come later when we need per-status color chips
 * inside the dropdown itself.
 */
export function StatusPicker({ mediaId, initialStatus }: Props) {
  const [status, setStatus] = useState<ShowStatus | "">(initialStatus ?? "");
  const [pending, startTransition] = useTransition();

  const change = (next: ShowStatus) => {
    setStatus(next);
    startTransition(async () => {
      await setShowStatusAction({ mediaId, status: next });
    });
  };

  const activeColor = OPTIONS.find((o) => o.key === status)?.cssVar;

  return (
    <div className="relative">
      <select
        value={status}
        onChange={(e) => change(e.target.value as ShowStatus)}
        disabled={pending}
        className="appearance-none pl-6 pr-8 py-1.5 text-sm font-semibold rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          background: "var(--secondary)",
          color: "var(--foreground)",
        }}
      >
        <option value="" disabled>
          Set status
        </option>
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {activeColor && (
        <span
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
          style={{ background: activeColor }}
        />
      )}
      <span
        aria-hidden
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
        style={{ color: "var(--meta)" }}
      >
        ▾
      </span>
    </div>
  );
}
