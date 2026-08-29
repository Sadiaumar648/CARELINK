"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { NotificationsBell } from "@/components/notifications-bell";
import { ReadAloudToggle } from "@/components/read-aloud-toggle";

export type NavItem = { href: string; label: string; icon: Icon };

// The App Flow doc's per-role nav, responsive: a bottom tab bar on narrow
// screens, a left rail on wide ones — never icon-only, always paired with
// a label. `largeTargets` and `readAloud` are the caregiver-facing
// accessibility pass (task 4.6) — a 52px minimum touch target on every
// nav item, and an opt-in toggle to read each screen's heading aloud.
export function RoleShell({
  items,
  bookingHref,
  largeTargets = false,
  readAloud = false,
  children,
}: {
  items: NavItem[];
  bookingHref?: (bookingId: string) => string;
  largeTargets?: boolean;
  readAloud?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  // Nav hrefs are nested ("/parent" is a prefix of "/parent/bookings"), so
  // more than one item can match a startsWith check at once — pick the
  // single longest (most specific) match rather than lighting up every
  // ancestor route's nav item together.
  const activeHref = items
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-hairline bg-sheet [padding-bottom:env(safe-area-inset-bottom)] md:static md:z-auto md:w-56 md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:p-4 md:[padding-bottom:1rem]">
        {items.map((item) => {
          const active = item.href === activeHref;
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 text-[13px] font-semibold md:flex-row md:gap-2 md:justify-start md:rounded ${
                largeTargets ? "min-h-[52px] min-w-[52px]" : ""
              } ${active ? "text-sage" : "text-ink-muted hover:text-ink"}`}
            >
              <ItemIcon size={24} weight={active ? "duotone" : "regular"} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => void signOut()}
          className={`hidden items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-muted hover:text-error md:mt-auto md:flex md:rounded ${
            largeTargets ? "min-h-[52px]" : ""
          }`}
        >
          <SignOut size={24} />
          Sign out
        </button>
      </nav>
      <main className="flex-1 pb-20 md:pb-0">
        <div className="flex items-center justify-end gap-2 border-b border-hairline p-2 md:p-3">
          {readAloud && <ReadAloudToggle />}
          <NotificationsBell bookingHref={bookingHref} />
        </div>
        {children}
      </main>
    </div>
  );
}
