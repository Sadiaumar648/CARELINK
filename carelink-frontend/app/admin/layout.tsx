"use client";

import {
  SquaresFour,
  UsersFour,
  UsersThree,
  CalendarCheck,
  Flag,
  GearSix,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { AdminHeaderLogo } from "@/components/admin/header-nav";
import { AdminHeaderProfile } from "@/components/admin/header-profile";

// CareLink's final business model: agency-controlled, not an open
// marketplace caregivers verify themselves into. "Verifications" is
// removed as a primary nav destination — caregiver onboarding now
// belongs inside Caregivers (the existing /admin/roster page; no
// separate /admin/caregivers route exists to move it to, so this
// reuses the real existing page rather than inventing a new URL).
// Admin keeps its desktop sidebar, unlike Parent/Staff — this stays an
// information-dense operations dashboard — with a new header (logo +
// profile dropdown) layered on top of it via RoleShell's headerLeft/
// headerExtra slots, same mechanism already proven for Parent/Staff.
const items: NavItem[] = [
  { href: "/admin", label: "Overview", icon: SquaresFour },
  { href: "/admin/users", label: "Users", icon: UsersFour },
  { href: "/admin/roster", label: "Caregivers", icon: UsersThree },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/settings", label: "Settings", icon: GearSix },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireRole role="admin">
      <RoleShell
        items={items}
        headerLeft={<AdminHeaderLogo />}
        headerExtra={<AdminHeaderProfile />}
        sidebarFooter={
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Admin
          </p>
        }
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
