"use client";

import { House, MagnifyingGlass, ChatCircle, Bell, GearSix } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { ParentHeaderLogo, ParentHeaderIcons } from "@/components/parent/header-nav";
import { ParentHeaderProfile } from "@/components/parent/header-profile";

// The reference design puts every destination in the header instead of
// a desktop sidebar (RoleShell's rail is hidden via railWidthClassName
// below) — Find Care/Messages/Notifications live as header icons
// (ParentHeaderIcons + the existing NotificationsBell), and
// Payments/Help & Support/Settings live in the profile dropdown
// (ParentHeaderProfile). My Wards and My Bookings are reachable from
// /parent/account (Settings), same as before.
//
// The mobile bottom tab bar is unaffected by any of this — a phone
// still needs labelled nav, so it keeps its own curated 5 items.
const mobileItems: NavItem[] = [
  { href: "/parent", label: "Home", icon: House },
  { href: "/parent/find-care", label: "Find Care", icon: MagnifyingGlass },
  { href: "/parent/messages", label: "Messages", icon: ChatCircle },
  { href: "/parent/notifications", label: "Notifications", icon: Bell },
  { href: "/parent/account", label: "Settings", icon: GearSix },
];

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <RequireRole role="parent">
      <RoleShell
        items={mobileItems}
        mobileItems={mobileItems}
        headerLeft={<ParentHeaderLogo />}
        headerExtra={
          <>
            <ParentHeaderIcons />
            <ParentHeaderProfile />
          </>
        }
        bookingHref={(id) => `/parent/bookings/${id}`}
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:hidden"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
