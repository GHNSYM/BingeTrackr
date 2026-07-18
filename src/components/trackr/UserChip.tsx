"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  username: string;
  displayName: string | null;
};

/**
 * Bottom-of-sidebar user chip. Click → menu with profile / settings / log out.
 * Log out uses a nested form so the server action can be invoked without JS.
 */
export function UserChip({ username, displayName }: Props) {
  const initial = ((displayName || username)[0] ?? "?").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-secondary transition"
      >
        <span
          className="w-8 h-8 rounded-full grid place-items-center font-extrabold text-sm shrink-0"
          style={{
            background: "var(--surface2)",
            color: "var(--foreground)",
          }}
          aria-hidden
        >
          {initial}
        </span>
        <span className="flex-1 min-w-0 flex flex-col items-start">
          <span
            className="text-sm font-semibold truncate max-w-[150px]"
            style={{ color: "var(--foreground)" }}
          >
            {displayName || `@${username}`}
          </span>
          <span
            className="text-xs truncate max-w-[150px]"
            style={{ color: "var(--meta)" }}
          >
            @{username}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="min-w-[200px] p-1"
      >
        <DropdownMenuItem asChild>
          <Link
            href={`/u/${username}`}
            className="flex items-center gap-2 py-2 px-2 cursor-pointer"
          >
            <span className="text-sm">Your profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled
          className="flex items-center gap-2 py-2 px-2 opacity-50"
        >
          <Settings size={14} />
          <span className="text-sm">Settings</span>
          <span className="ml-auto text-[10px] tracking-widest font-semibold text-meta">
            SOON
          </span>
        </DropdownMenuItem>
        <div className="my-1 h-px" style={{ background: "var(--border)" }} />
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 py-2 px-2 rounded-md text-sm hover:bg-secondary transition text-left"
            style={{ color: "var(--status-dropped)" }}
          >
            <LogOut size={14} />
            Log out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
