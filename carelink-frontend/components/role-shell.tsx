"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { NotificationsBell } from "@/components/notifications-bell";
import { ReadAloudToggle } from "@/components/read-aloud-toggle";

export type NavItem = { href: string; label: string; icon: Icon; badge?: number };

// The App Flow doc's per-role nav, responsive: a bottom tab bar on narrow
// screens, a left rail on wide ones — never icon-only, always paired with
// a label. `largeTargets` and `readAloud` are the caregiver-facing
// accessibility pass (task 4.6) — a 52px minimum touch target on every
// nav item, and an opt-in toggle to read each screen's heading aloud.
//
// `mobileItems` lets a role show a curated subset on the bottom tab bar
// while keeping the full set on the desktop rail (there isn't room for
// nine labelled tabs at the bottom of a phone) — it defaults to `items`,
// so a role that doesn't pass it renders exactly as before.
// `sidebarHeader`/`sidebarFooter` are optional desktop-rail-only slots
// for role-specific content (a logo block, a support/emergency card).
// `headerLeft` is an optional slot at the start of the top header bar
// (e.g. a logo, when a role has no desktop rail to put one in) and
// `headerExtra` is an optional slot at the end of it, after the
// notifications bell (e.g. a profile/name cluster) — all omitted by
// default, so roles that don't use them are unaffected.
// `activeItemClassName`/`railWidthClassName`/`mainClassName` are small
// visual overrides (active-nav styling, rail width, content background).
// Passing `railWidthClassName="md:hidden"` removes the desktop rail
// entirely (mobile's bottom tab bar is untouched either way) for a role
// whose reference design puts every destination in the header instead —
// all of this defaults to today's exact rail-based layout otherwise.
export function RoleShell({
  items,
  mobileItems,
  sidebarHeader,
  sidebarFooter,
  headerLeft,
  headerExtra,
  bookingHref,
  largeTargets = false,
  readAloud = false,
  hideNotificationsBell = false,
  activeItemClassName = "text-wisteria",
  railWidthClassName = "md:w-56",
  mainClassName = "",
  children,
}: {
  items: NavItem[];
  mobileItems?: NavItem[];
  sidebarHeader?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  headerLeft?: React.ReactNode;
  headerExtra?: React.ReactNode;
  bookingHref?: (bookingId: string) => string;
  largeTargets?: boolean;
  readAloud?: boolean;
  // CareLink's real phone/SMS notification system: SMS now carries the
  // action-required alerts this in-app bell used to be the only way to
  // see, so Parent and Staff (the two roles this task scopes) hide it
  // from their header. Defaults to false — every other role (Admin)
  // keeps the bell exactly as it already worked, unaffected.
  hideNotificationsBell?: boolean;
  activeItemClassName?: string;
  railWidthClassName?: string;
  mainClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const tabItems = mobileItems ?? items;

  // Nav hrefs are nested ("/parent" is a prefix of "/parent/bookings"), so
  // more than one item can match a startsWith check at once — pick the
  // single longest (most specific) match rather than lighting up every
  // ancestor route's nav item together.
  function activeHrefFor(navItems: NavItem[]): string | undefined {
    return navItems
      .map((item) => item.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0];
  }

  function renderItem(item: NavItem, active: boolean) {
    const ItemIcon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`relative flex flex-col items-center justify-center gap-1 px-3 py-2 text-[13px] font-semibold md:flex-row md:gap-2 md:justify-start md:rounded ${
          largeTargets ? "min-h-[52px] min-w-[52px]" : ""
        } ${active ? activeItemClassName : "text-ink-muted hover:text-ink"}`}
      >
        <span className="relative">
          <ItemIcon size={24} weight={active ? "duotone" : "regular"} />
          {!!item.badge && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold text-sheet">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </span>
        {item.label}
      </Link>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav
        className={`fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-hairline bg-sheet [padding-bottom:env(safe-area-inset-bottom)] md:static md:z-auto md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:p-4 md:[padding-bottom:1rem] ${railWidthClassName}`}
      >
        {/* Mobile bottom tab bar — curated subset. */}
        <div className="flex w-full justify-around md:hidden">
          {tabItems.map((item) => renderItem(item, item.href === activeHrefFor(tabItems)))}
        </div>

        {/* Desktop rail — full item set + optional header/footer slots. */}
        {sidebarHeader && <div className="hidden md:mb-4 md:block">{sidebarHeader}</div>}
        <div className="hidden md:flex md:flex-col md:gap-1">
          {items.map((item) => renderItem(item, item.href === activeHrefFor(items)))}
        </div>
        <div className="hidden md:mt-auto md:flex md:flex-col md:gap-3">
          {sidebarFooter}
          <button
            onClick={() => void signOut()}
            className={`flex items-center gap-2 rounded px-3 py-2 text-left text-[13px] font-semibold text-ink-muted hover:text-error ${
              largeTargets ? "min-h-[52px]" : ""
            }`}
          >
            <SignOut size={24} />
            Sign out
          </button>
        </div>
      </nav>
      <main className={`flex-1 pb-20 md:pb-0 ${mainClassName}`}>
        <div className="flex items-center justify-between gap-2 border-b border-hairline p-2 md:p-3">
          <div className="flex items-center">{headerLeft}</div>
          <div className="flex items-center gap-2">
            {readAloud && <ReadAloudToggle />}
            {!hideNotificationsBell && <NotificationsBell bookingHref={bookingHref} />}
            {headerExtra}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
