"use client";

import { useState, useTransition } from "react";
import { renameTierLabelAction } from "@/lib/tracking/actions";
import type { TierKey } from "@/lib/tracking/queries";

type Props = {
  tier: TierKey;
  label: string;
  onLocalChange: (next: string) => void;
};

/**
 * Inline-editable band letter. Click to edit; Enter saves; Escape cancels.
 * Max 3 chars per DB check constraint. Optimistic — parent updates local
 * state immediately; server action fires on commit.
 */
export function EditableTierLabel({ tier, label, onLocalChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const clean = draft.trim().slice(0, 3);
    setEditing(false);
    if (!clean || clean === label) {
      setDraft(label);
      return;
    }
    onLocalChange(clean);
    startTransition(async () => {
      await renameTierLabelAction({ tier, label: clean });
    });
  };

  const cancel = () => {
    setDraft(label);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={3}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-full bg-transparent text-center outline-none text-3xl sm:text-5xl font-extrabold tracking-tight"
        style={{ color: "inherit" }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      className="w-full text-center outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-md text-3xl sm:text-5xl font-extrabold tracking-tight"
      style={{ color: "inherit" }}
      title="Click to rename"
    >
      {label}
    </button>
  );
}
