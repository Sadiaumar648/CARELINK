"use client";

import { House, UsersThree, Baby, CalendarCheck, Star, Flag } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { AdminHeaderLogo } from "@/components/admin/header-nav";
import { AdminHeaderProfile } from "@/components/admin/header-profile";

// Final CareLink Admin dashboard: header-only navigation, the same
// pattern already used by Parent and Staff (RoleShell's desktop rail
// hidden via railWidthClassName, headerLeft/headerExtra carry the logo
// and profile dropdown). No left sidebar, and nothing replaces it — the
// six operational destinations live as Quick Action cards on /admin
// itself, and every subpage below only needs this curated set for the
// mobile bottom tab bar (the desktop rail these would otherwise render
// in is hidden). Settings stays reachable from the profile dropdown, on
// both desktop and mobile alike.
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
