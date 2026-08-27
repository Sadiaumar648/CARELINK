"use client";

import { Tray, CalendarBlank, UserCircle, ChatCircle, Wallet } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";

const items: NavItem[] = [
  { href: "/staff", label: "Requests", icon: Tray },
  { href: "/staff/schedule", label: "Schedule", icon: CalendarBlank },
  { href: "/staff/profile", label: "Profile", icon: UserCircle },
  { href: "/staff/messages", label: "Messages", icon: ChatCircle },
  { href: "/staff/earnings", label: "Earnings", icon: Wallet },
];

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <RequireRole role="staff">
      <RoleShell items={items} bookingHref={(id) => `/staff/schedule/${id}`} largeTargets readAloud>
        {children}
      </RoleShell>
    </RequireRole>
  );
}
