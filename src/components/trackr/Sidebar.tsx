"use client";

import {
  BarChart3,
  Check,
  Compass,
  Home,
  LibraryBig,
  Layers,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserChip } from "./UserChip";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/tiers", label: "Tiers", icon: Layers },
  { href: "/stats", label: "Stats", icon: BarChart3 },
];

type Props = {
  username: string;
  displayName: string | null;
};

export function Sidebar({ username, displayName }: Props) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-[236px] border-r"
      style={{
        background: "var(--bg2)",
        borderColor: "var(--border)",
        height: "100dvh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-6">
        <Link
          href="/home"
          className="inline-flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span
            className="w-8 h-8 rounded-lg grid place-items-center font-extrabold text-sm"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            aria-hidden
          >
            <Check size={16} strokeWidth={3} />
          </span>
          <span>BingeTrackr</span>
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1 px-3">
        {PRIMARY_NAV.map((item) => (
          <NavRow key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Spacer + user chip */}
      <div className="mt-auto p-3">
        <UserChip username={username} displayName={displayName} />
      </div>
    </aside>
  );
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    item.href === "/home"
      ? pathname === "/home"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
        style={{ color: "var(--meta)", opacity: 0.55 }}
        aria-disabled
      >
        <Icon size={18} strokeWidth={1.75} />
        <span>{item.label}</span>
        <span
          className="ml-auto text-[10px] tracking-widest uppercase font-semibold"
          style={{ opacity: 0.7 }}
        >
          Soon
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition"
      style={{
        background: active ? "var(--surface2)" : "transparent",
        color: active ? "var(--foreground)" : "var(--body)",
      }}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.75} />
      <span>{item.label}</span>
    </Link>
  );
}
