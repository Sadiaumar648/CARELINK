"use client";

import { Tray, CalendarBlank, UserCircle, ChatCircle, Wallet } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { StaffHeaderLogo, StaffHeaderIcons } from "@/components/staff/header-nav";
import { StaffHeaderProfile } from "@/components/staff/header-profile";

// The redesigned reference puts every destination in the header instead
// of a desktop sidebar (RoleShell's rail hidden via railWidthClassName
// below, same pattern app/parent/layout.tsx already uses) — Messages
// lives as a header icon (StaffHeaderIcons) and Profile/Settings/Help &
// Support/Log Out live in the profile dropdown (StaffHeaderProfile).
// Requests (this page itself), Schedule, and Earnings stay reachable
// from in-page links/cards on the Home dashboard, same "existing route,
// new entry point" approach as Parent's My Wards/My Bookings.
//
// The mobile bottom tab bar is unaffected — a phone still needs
// labelled nav, so it keeps this exact same 5-item set exactly as it
// already worked before this redesign.
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
      <RoleShell
        items={items}
        mobileItems={items}
        headerLeft={<StaffHeaderLogo />}
        headerExtra={
          <>
            <StaffHeaderIcons />
            <StaffHeaderProfile />
          </>
        }
        bookingHref={(id) => `/staff/schedule/${id}`}
        largeTargets
        readAloud
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:hidden"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
