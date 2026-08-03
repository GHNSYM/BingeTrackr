"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared dark/light primitive. The theme *is* the `dark` class on `<html>`
 * (`:root` is light, `.dark` overrides it — see globals.css), applied before
 * first paint by the inline script in the root layout; this hook only reads
 * and flips it.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`:
 * - **No hydration mismatch.** `getServerSnapshot` returns `true`, which is
 *   always correct — the server unconditionally emits `class="dark"`.
 * - **No setState-in-effect**, which `react-hooks/set-state-in-effect` flags.
 * - **Tracks changes it didn't cause.** The MutationObserver means the landing
 *   page's `ThemeToggle` and the app's `SettingsThemeToggle` — two independent
 *   instances of this hook — stay in sync with each other and with anything
 *   else that flips the class.
 *
 * Two consumers, deliberately kept separate rather than sharing one component:
 * `components/trackr/ThemeToggle` (landing, with the toggle-quip gimmick and
 * `.glass-liquid` styling — marketing-only per AGENTS.md's colour rule) and
 * `components/trackr/SettingsThemeToggle` (app chrome, monochrome, no quips).
 * Both call this same hook so the underlying flip logic can't drift between
 * them.
 */

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

/** The server always renders dark — it's the design system's default. */
const getServerSnapshot = () => true;

export function useTheme(): { isDark: boolean; setDark: (next: boolean) => void } {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDark = (next: boolean) => {
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled. The toggle still works for this page
      // view, it just won't be remembered. Not worth surfacing.
    }
  };

  return { isDark, setDark };
}
