"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { House, MagnifyingGlass, ChatCircle, Bell, GearSix } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { ParentHeaderLogo, ParentHeaderIcons } from "@/components/parent/header-nav";
import { ParentHeaderProfile } from "@/components/parent/header-profile";
import { useAuth } from "@/lib/auth/auth-context";

// CareLink rule: a parent must successfully complete Ghana Card identity
// verification (app/verify-identity) before reaching Parent Home or any
// other page in this dashboard. RequireRole above only confirms "signed
// in as a parent" — this closes the rest of the gap: unverified,
// pending, or failed all redirect to /verify-identity, whether the
// parent lands here straight from registration, types a dashboard URL
// directly, refreshes an already-open tab, or signs back in later after
// abandoning verification partway through. useAuth().verificationStatus
// is fetched from GET /api/me in the same call as role, so by the time
// RequireRole has let a parent through, it's already populated.
function RequireVerifiedParent({ children }: { children: ReactNode }) {
  const { verificationStatus } = useAuth();
  const router = useRouter();
  const verified = verificationStatus === "verified";

  useEffect(() => {
    if (!verified) router.replace("/verify-identity");
  }, [verified, router]);

  if (!verified) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-ink-muted">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}

// The reference design puts every destination in the header instead of
// a desktop sidebar (RoleShell's rail is hidden via railWidthClassName
// below) — Find Care/Messages live as header icons (ParentHeaderIcons),
// and Settings lives in the profile dropdown (ParentHeaderProfile). My
// Wards, My Bookings, Payment Methods, and Help & Support are all
// reachable from /parent/account (Settings), same as before.
//
// CareLink's real phone/SMS notification system: the header's
// NotificationsBell is hidden here (hideNotificationsBell) now that SMS
// carries the action-required alerts it used to be the only way to see.
// The underlying /api/notifications system, the dedicated
// /parent/notifications page, and its bottom-tab entry above are all
// untouched — only the header bell is removed.
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
      <RequireVerifiedParent>
        <RoleShell
          items={mobileItems}
          mobileItems={mobileItems}
          headerLeft={<ParentHeaderLogo />}
          homeHref="/parent"
          headerExtra={
            <>
              <ParentHeaderIcons />
              <ParentHeaderProfile />
            </>
          }
          bookingHref={(id) => `/parent/bookings/${id}`}
          hideNotificationsBell
          activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
          railWidthClassName="md:hidden"
          mainClassName="bg-[var(--color-lavender-bg)]"
        >
          {children}
        </RoleShell>
      </RequireVerifiedParent>
    </RequireRole>
  );
}
