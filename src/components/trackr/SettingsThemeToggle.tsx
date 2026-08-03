"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Plain dark/light switch for the app's Settings page.
 *
 * Deliberately NOT the landing page's `ThemeToggle` — that one carries the
 * toggle-quip gimmick and `.glass-liquid`/gradient styling, both scoped to the
 * marketing page on purpose (AGENTS.md: colour outside poster art, tier bands
 * and banners doesn't belong in the app shell). This shares the same
 * underlying `useTheme` hook, so both stay in sync with each other and with
 * whatever the user last set — flipping one and visiting the other shows the
 * change already applied.
 */
export function SettingsThemeToggle() {
  const { isDark, setDark } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex gap-1 p-1 shrink-0"
      style={{ background: "var(--secondary)", borderRadius: "var(--radius-pill)" }}
    >
      {(
        [
          { key: false, label: "Light", icon: Sun },
          { key: true, label: "Dark", icon: Moon },
        ] as const
      ).map((opt) => {
        const isActive = isDark === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setDark(opt.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              borderRadius: "var(--radius-pill)",
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--accent-ink)" : "var(--body)",
            }}
          >
            <Icon size={14} strokeWidth={2} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
