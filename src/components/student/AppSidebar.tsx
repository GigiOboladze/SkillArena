"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  IconBug,
  IconGamepad,
  IconHome,
  IconLayers,
  IconLogout,
  IconMessage,
  IconQuiz,
  IconShield,
  IconTrophy,
  IconUser,
  IconUsers,
} from "./Icons";

/**
 * Icons are referenced by name (not passed as JSX) so the server layouts
 * can build the nav list as plain data.
 */
const ICONS = {
  home: IconHome,
  trophy: IconTrophy,
  bug: IconBug,
  message: IconMessage,
  user: IconUser,
  quiz: IconQuiz,
  gamepad: IconGamepad,
  users: IconUsers,
  shield: IconShield,
  layers: IconLayers,
} as const;

export type SidebarIcon = keyof typeof ICONS;

export type SidebarItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
  /** Only highlight on an exact path match (for the section's root page). */
  exact?: boolean;
  /** Small red count bubble, e.g. open bug reports. Hidden when 0 / undefined. */
  count?: number;
  /** Short label for the phone bottom tab bar (falls back to `label`). */
  shortLabel?: string;
};

function isActive(pathname: string, item: SidebarItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Count({ value }: { value?: number }) {
  if (!value) return null;
  return <span className="sa-nav-count">{value > 99 ? "99+" : value}</span>;
}

/**
 * Shared navigation for the student area and the admin area.
 *
 * - From `lg` up: a left sidebar (logo, nav, then the signed-in user,
 *   theme switch and log out pinned to the bottom).
 * - Below `lg`: a sticky top bar with a horizontally scrollable pill row,
 *   so nothing is hidden behind a menu button on a phone.
 *
 * It is a client component only because the active-item highlight needs
 * `usePathname()`. Which items appear (e.g. Super-Admin-only links) is
 * decided by the server layout that passes `items` - this component just
 * renders what it is given. Log out still submits the existing server action.
 */
export function AppSidebar({
  homeHref,
  areaLabel,
  items,
  userName,
  userDetail,
  logoutAction,
  bottomNav = false,
}: {
  homeHref: string;
  /** Small tag next to the wordmark, e.g. "Admin". */
  areaLabel?: string;
  items: SidebarItem[];
  userName: string;
  userDetail: string | null;
  logoutAction: () => Promise<void>;
  /**
   * Phones/tablets: show the items as an app-style tab bar fixed to the
   * bottom of the screen instead of the scrollable pill row (best for a
   * handful of items - the student area).
   */
  bottomNav?: boolean;
}) {
  const pathname = usePathname();
  const pillRow = useRef<HTMLElement>(null);

  // Keep the current page's pill in view in the scrollable top row.
  useEffect(() => {
    const active = pillRow.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sa-sidebar" aria-label="Main navigation">
        <div className="sa-sidebar-inner">
          <Link href={homeHref} className="flex items-center gap-2.5 px-2">
            <Logo size={34} variant="mark" priority />
            <span className="text-lg font-black tracking-tight text-rahoot-ink">SkillArena</span>
            {areaLabel && <span className="sa-area-tag">{areaLabel}</span>}
          </Link>

          <nav className="sa-sidebar-nav mt-8 flex flex-col gap-1">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`sa-nav-item ${active ? "is-active" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex-1">{item.label}</span>
                  <Count value={item.count} />
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-4">
            <div className="sa-sidebar-user">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-rahoot-ink">{userName}</p>
                {userDetail && <p className="truncate text-xs text-rahoot-muted">{userDetail}</p>}
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
      <header className={`sa-topbar ${bottomNav ? "has-bottomnav" : ""}`}>
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href={homeHref} className="flex items-center gap-2">
            <Logo size={28} variant="mark" priority />
            <span className="font-black tracking-tight text-rahoot-ink">SkillArena</span>
            {areaLabel && <span className="sa-area-tag">{areaLabel}</span>}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={logoutAction}>
              <button type="submit" className="sa-icon-btn" aria-label="Log out">
                <IconLogout className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
        {!bottomNav && (
        <nav ref={pillRow} className="sa-topbar-nav" aria-label="Main navigation">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`sa-pill ${active ? "is-active" : ""}`}
              >
                <Icon />
                {item.label}
                <Count value={item.count} />
              </Link>
            );
          })}
        </nav>
        )}
        {bottomNav && <div className="h-3" aria-hidden />}
      </header>

      {bottomNav && (
        <nav className="sa-bottomnav" aria-label="Main navigation" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`sa-tab ${active ? "is-active" : ""}`}
              >
                <span className="sa-tab-icon">
                  <Icon className="h-[22px] w-[22px]" />
                  <Count value={item.count} />
                </span>
                <span className="sa-tab-label">{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
