"use client";

import { House, Tray, CalendarBlank, ChatCircle, Wallet } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { StaffHeaderLogo, StaffHeaderIcons } from "@/components/staff/header-nav";
import { StaffHeaderProfile } from "@/components/staff/header-profile";

// The redesigned reference puts every destination in the header instead
// of a desktop sidebar (RoleShell's rail hidden via railWidthClassName
// below, same pattern app/parent/layout.tsx already uses) — Messages
// lives as a header icon (StaffHeaderIcons) and Settings/Log Out live in
// the profile dropdown (StaffHeaderProfile).
//
// /staff is now purely the Home dashboard; the pending-requests
// accept/decline list that used to live there moved to its own
// /staff/requests page (Section 11 of the redesign: Home only shows a
// "Requests waiting" summary card, the full list has its own
// destination) — no functionality was removed, only relocated.
const items: NavItem[] = [
  { href: "/staff", label: "Home", icon: House },
  { href: "/staff/requests", label: "Requests", icon: Tray },
  { href: "/staff/schedule", label: "Schedule", icon: CalendarBlank },
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
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:hidden"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
