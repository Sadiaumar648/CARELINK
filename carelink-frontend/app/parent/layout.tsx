"use client";

import {
  MagnifyingGlass,
  CalendarCheck,
  Baby,
  ChatCircle,
  UserCircle,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";

const items: NavItem[] = [
  { href: "/parent", label: "Search", icon: MagnifyingGlass },
  { href: "/parent/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/parent/children", label: "Children", icon: Baby },
  { href: "/parent/messages", label: "Messages", icon: ChatCircle },
  { href: "/parent/account", label: "Account", icon: UserCircle },
];

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <RequireRole role="parent">
      <RoleShell items={items}>{children}</RoleShell>
    </RequireRole>
  );
}
