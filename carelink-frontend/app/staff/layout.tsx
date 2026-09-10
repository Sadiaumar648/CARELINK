"use client";

import { House, Tray, CalendarBlank, ChatCircle, Wallet } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { StaffHeaderLogo, StaffHeaderIcons } from "@/components/staff/header-nav";
import { StaffHeaderProfile } from "@/components/staff/header-profile";
import { Skeleton } from "@/components/ui/skeleton";

// Shown only for the brief window RequireRole is still confirming the
// signed-in account is really a caregiver — never a different role's
// dashboard, never the pre-redesign layout, just a neutral placeholder
// shaped like this one (header + availability/location row + stat row
// + profile banner). Generic enough to also cover the same loading
// window on every other /staff/* route this layout wraps, not only
// Home. Staff-only: passing this via RequireRole's optional
// `loadingFallback` prop leaves Parent's and Admin's own fallback
// untouched.
function StaffLoadingSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

// The redesigned reference puts every destination in the header instead
// of a desktop sidebar (RoleShell's rail hidden via railWidthClassName
// below, same pattern app/parent/layout.tsx already uses) — Messages
// lives as a header icon (StaffHeaderIcons) and Settings/Log Out live in
// the profile dropdown (StaffHeaderProfile).
//
// /staff/requests is the full pending-requests list; Home now also
// shows a "New care request" alert at the top (app/staff/page.tsx's
// NewRequestsAlert) with the same Accept/Decline actions, so a
// caregiver is told about a new request the moment they open the app.
//
// The header's NotificationsBell is shown again: it was hidden while
// SMS carried the action-required alerts, but notifications
// (/api/notifications — a 'booking_request' row is created for the
// caregiver by a DB trigger the instant an offer lands) are now the
// primary channel, with email only a backup.
const items: NavItem[] = [
  { href: "/staff", label: "Home", icon: House },
  { href: "/staff/requests", label: "Requests", icon: Tray },
  { href: "/staff/schedule", label: "Schedule", icon: CalendarBlank },
  { href: "/staff/messages", label: "Messages", icon: ChatCircle },
  { href: "/staff/earnings", label: "Earnings", icon: Wallet },
];

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <RequireRole role="staff" loadingFallback={<StaffLoadingSkeleton />}>
      <RoleShell
        items={items}
        mobileItems={items}
        headerLeft={<StaffHeaderLogo />}
        homeHref="/staff"
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
