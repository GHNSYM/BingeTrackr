"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setProfilePrivacyAction } from "@/lib/auth/actions";

/**
 * Public/private switch for Settings. Self-contained (owns its own optimistic
 * state + transition) rather than split into controlled/uncontrolled halves
 * like the title-page track buttons — there's only one instance of this on the
 * page, so there's no sibling that needs to see the same state.
 */
export function PrivacyToggle({ initialIsPublic }: { initialIsPublic: boolean }) {
  const [isPublic, setIsPublic] = useOptimistic(initialIsPublic);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setValue = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setIsPublic(next);
      const result = await setProfilePrivacyAction(next);
      if ("error" in result) setError("Couldn't save — try again.");
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        role="radiogroup"
        aria-label="Profile visibility"
        className="flex gap-1 p-1 shrink-0"
        style={{ background: "var(--secondary)", borderRadius: "var(--radius-pill)" }}
      >
        {(
          [
            { key: false, label: "Private" },
            { key: true, label: "Public" },
          ] as const
        ).map((opt) => {
          const isActive = isPublic === opt.key;
          return (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={pending}
              onClick={() => setValue(opt.key)}
              className="px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                borderRadius: "var(--radius-pill)",
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent-ink)" : "var(--body)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--status-dropped)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
