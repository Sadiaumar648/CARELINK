"use client";

import {
  House,
  MagnifyingGlass,
  Baby,
  CalendarCheck,
  ChatCircle,
  Bell,
  Wallet,
  Question,
  GearSix,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { ParentSidebarHeader, ParentSidebarFooter } from "@/components/parent/sidebar-extras";
import { useUnreadNotificationsCount } from "@/lib/hooks/use-unread-notifications-count";

// The full set shown on the desktop rail. Everything not in the mobile
// bar below is still reachable within one tap from /parent/account,
// which already links to Wards, Payments, Notifications, Help, and
// Safety — so nothing here becomes unreachable on a small screen.
const mobileItems: NavItem[] = [
  { href: "/parent", label: "Home", icon: House },
  { href: "/parent/find-care", label: "Find Care", icon: MagnifyingGlass },
  { href: "/parent/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/parent/messages", label: "Messages", icon: ChatCircle },
  { href: "/parent/account", label: "Settings", icon: GearSix },
];

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  const unreadCount = useUnreadNotificationsCount();

  const items: NavItem[] = [
    { href: "/parent", label: "Home", icon: House },
    { href: "/parent/find-care", label: "Find Care", icon: MagnifyingGlass },
    { href: "/parent/children", label: "My Wards", icon: Baby },
    { href: "/parent/bookings", label: "My Bookings", icon: CalendarCheck },
    { href: "/parent/messages", label: "Messages", icon: ChatCircle },
    {
      href: "/parent/notifications",
      label: "Notifications",
      icon: Bell,
      badge: unreadCount || undefined,
    },
    { href: "/parent/payment-methods", label: "Payments", icon: Wallet },
    { href: "/parent/help", label: "Help & Support", icon: Question },
    { href: "/parent/account", label: "Settings", icon: GearSix },
  ];

  return (
    <RequireRole role="parent">
      <RoleShell
        items={items}
        mobileItems={mobileItems}
        sidebarHeader={<ParentSidebarHeader />}
        sidebarFooter={<ParentSidebarFooter />}
        bookingHref={(id) => `/parent/bookings/${id}`}
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
