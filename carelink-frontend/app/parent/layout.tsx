"use client";

import {
  House,
  MagnifyingGlass,
  ChatCircle,
  Bell,
  Wallet,
  Question,
  GearSix,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { ParentSidebarHeader, ParentSidebarFooter } from "@/components/parent/sidebar-extras";
import { ParentHeaderProfile } from "@/components/parent/header-profile";
import { useUnreadNotificationsCount } from "@/lib/hooks/use-unread-notifications-count";

// Exactly the seven items the reference design specifies. My Wards and
// My Bookings are reachable from /parent/account (Settings) instead of
// occupying a top-level slot — that page already lists Ward Profiles,
// Payment Methods, Notifications, Help & Support, and Safety this way,
// and now also lists My Bookings alongside them.
const mobileItems: NavItem[] = [
  { href: "/parent", label: "Home", icon: House },
  { href: "/parent/find-care", label: "Find Care", icon: MagnifyingGlass },
  { href: "/parent/messages", label: "Messages", icon: ChatCircle },
  { href: "/parent/notifications", label: "Notifications", icon: Bell },
  { href: "/parent/account", label: "Settings", icon: GearSix },
];

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  const unreadCount = useUnreadNotificationsCount();

  const items: NavItem[] = [
    { href: "/parent", label: "Home", icon: House },
    { href: "/parent/find-care", label: "Find Care", icon: MagnifyingGlass },
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
        headerExtra={<ParentHeaderProfile />}
        bookingHref={(id) => `/parent/bookings/${id}`}
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:w-60"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
