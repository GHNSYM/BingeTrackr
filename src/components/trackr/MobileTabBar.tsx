"use client";

import { Compass, Home, LibraryBig, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  matchPrefix?: string;
};

type Props = {
  username: string;
};

export function MobileTabBar({ username }: Props) {
  const pathname = usePathname();

  const TABS: Tab[] = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/library", label: "Library", icon: LibraryBig, matchPrefix: "/library" },
    { href: "/discover", label: "Discover", icon: Compass, matchPrefix: "/discover" },
    { href: `/u/${username}`, label: "Profile", icon: User, matchPrefix: "/u/" },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        borderColor: "var(--border)",
        backdropFilter: "blur(20px) saturate(1.2)",
        WebkitBackdropFilter: "blur(20px) saturate(1.2)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <ul className="flex items-center justify-around h-[68px]">
        {TABS.map((tab) => {
          const active = tab.matchPrefix
            ? pathname === tab.href || pathname.startsWith(tab.matchPrefix)
            : pathname === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className="flex flex-col items-center justify-center gap-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.25 : 1.75}
                  style={{
                    color: active ? "var(--foreground)" : "var(--meta)",
                  }}
                />
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{
                    color: active ? "var(--foreground)" : "var(--meta)",
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
