"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  IconBug,
  IconHome,
  IconLogout,
  IconMessage,
  IconTrophy,
  IconUser,
} from "./Icons";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <IconHome className="h-5 w-5" />,
    exact: true,
  },
  {
    href: "/dashboard/leaderboard",
    label: "Leaderboard",
    icon: <IconTrophy className="h-5 w-5" />,
  },
  {
    href: "/dashboard/bug-reports",
    label: "Bug Reports",
    icon: <IconBug className="h-5 w-5" />,
  },
  {
    href: "/dashboard/inco",
    label: "INCO",
    icon: <IconMessage className="h-5 w-5" />,
  },
  {
    href: "/dashboard/profile",
    label: "My Profile",
    icon: <IconUser className="h-5 w-5" />,
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Student navigation.
 *
 * - From `lg` up: a fixed left sidebar (logo, nav, then theme + log out
 *   pinned to the bottom).
 * - Below `lg`: the same items collapse into a sticky top bar with a
 *   horizontally scrollable pill row, so nothing is hidden behind a menu
 *   button on a phone.
 *
 * It is a client component only because the active-item highlight needs
 * `usePathname()`. The log-out button still submits the existing server
 * action, so auth behaviour is unchanged.
 */
export function StudentSidebar({
  studentName,
  programName,
  logoutAction,
}: {
  studentName: string;
  programName: string | null;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sa-sidebar" aria-label="Main navigation">
        <div className="sa-sidebar-inner">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
            <Logo size={34} variant="mark" priority />
            <span className="text-lg font-black tracking-tight text-rahoot-ink">
              SkillArena
            </span>
          </Link>

          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`sa-nav-item ${active ? "is-active" : ""}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3">
            <div className="sa-sidebar-user">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-rahoot-ink">
                  {studentName}
                </p>
                {programName && (
                  <p className="truncate text-xs text-rahoot-muted">
                    {programName}
                  </p>
                )}
              </div>
              <ThemeToggle />
            </div>
            <form action={logoutAction}>
              <button type="submit" className="sa-nav-item w-full">
                <IconLogout className="h-5 w-5" />
                <span>Log out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sa-topbar">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo size={28} variant="mark" priority />
            <span className="font-black tracking-tight text-rahoot-ink">
              SkillArena
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="sa-icon-btn"
                aria-label="Log out"
              >
                <IconLogout className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
        <nav className="sa-topbar-nav" aria-label="Main navigation">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`sa-pill ${active ? "is-active" : ""}`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
