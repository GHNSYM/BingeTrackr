"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileTabBar } from "./MobileTabBar";

type Props = {
  username: string;
  displayName: string | null;
  children: React.ReactNode;
};

/**
 * The workstation shell. Same data model on both surfaces; different chrome.
 * Sidebar (≥ md) ⇄ MobileTabBar (< md). TopBar is desktop-only — mobile
 * pages own their own headers.
 */
export function AppShell({ username, displayName, children }: Props) {
  return (
    <div className="flex-1 flex min-h-0">
      {/* Sidebar — desktop only */}
      <Sidebar username={username} displayName={displayName} />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar username={username} displayName={displayName} />
        <div className="flex-1 min-h-0 overflow-y-auto pb-[80px] md:pb-0">
          {children}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <MobileTabBar username={username} />
    </div>
  );
}
