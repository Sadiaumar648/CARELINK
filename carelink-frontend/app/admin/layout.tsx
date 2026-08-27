"use client";

import {
  SquaresFour,
  UsersThree,
  ShieldCheck,
  CalendarCheck,
  Flag,
  GearSix,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";

const items: NavItem[] = [
  { href: "/admin", label: "Overview", icon: SquaresFour },
  { href: "/admin/roster", label: "Roster", icon: UsersThree },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/settings", label: "Settings", icon: GearSix },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireRole role="admin">
      <RoleShell items={items}>{children}</RoleShell>
    </RequireRole>
  );
}
