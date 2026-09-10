"use client";

import { House, UsersThree, Baby, CalendarCheck, Star, Flag } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { AdminHeaderLogo } from "@/components/admin/header-nav";
import { AdminHeaderProfile } from "@/components/admin/header-profile";

// Final CareLink Admin dashboard: an intentionally minimal header — just
// the logo (left) and the profile dropdown (right), nothing else. A
// prior pass added a full desktop nav-links row and the notification
// bell; both were explicitly removed again per the latest direction —
// the header should read as "extremely clean and minimal." The mobile
// bottom tab bar below is the only nav surface left; on desktop,
// getting around is Quick Actions on Home plus each page's own
// "Back to..." link, the same pattern Parent/Staff already use.
const mobileItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: House },
  { href: "/admin/roster", label: "Caregivers", icon: UsersThree },
  { href: "/admin/users", label: "Families", icon: Baby },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: Flag },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireRole role="admin">
      <RoleShell
        items={mobileItems}
        mobileItems={mobileItems}
        headerLeft={<AdminHeaderLogo />}
        homeHref="/admin"
        headerExtra={<AdminHeaderProfile />}
        hideNotificationsBell
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:hidden"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
