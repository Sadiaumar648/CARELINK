"use client";

import { House, UsersThree, Baby, CalendarCheck, Star, Flag } from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { RoleShell, type NavItem } from "@/components/role-shell";
import { AdminHeaderLogo, AdminHeaderNav } from "@/components/admin/header-nav";
import { AdminHeaderProfile } from "@/components/admin/header-profile";

// Final CareLink Admin dashboard: header-only navigation, the same
// pattern already used by Parent and Staff (RoleShell's desktop rail
// hidden via railWidthClassName, headerLeft/headerExtra carry the logo
// and profile dropdown). No left sidebar, and nothing replaces it — on
// desktop, AdminHeaderNav (a real link row covering all 9 destinations)
// sits next to the logo in headerLeft; below that breakpoint it hides
// and this curated 6-item set becomes the mobile bottom tab bar
// instead — two different, real nav surfaces for two screen sizes,
// never both at once. Settings stays reachable from the profile
// dropdown too, on both. The real, existing NotificationsBell is shown
// (not hidden, unlike Parent/Staff) — Admin has no SMS/email channel of
// its own carrying these alerts the way Parent/Staff do.
const mobileItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: House },
  { href: "/admin/roster", label: "Caregivers", icon: UsersThree },
  { href: "/admin/users", label: "Families", icon: Baby },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: Flag },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireRole role="admin">
      <RoleShell
        items={mobileItems}
        mobileItems={mobileItems}
        headerLeft={
          <div className="flex items-center gap-6">
            <AdminHeaderLogo />
            <AdminHeaderNav />
          </div>
        }
        headerExtra={<AdminHeaderProfile />}
        activeItemClassName="rounded-[10px] bg-wisteria-tint text-wisteria"
        railWidthClassName="md:hidden"
        mainClassName="bg-[var(--color-lavender-bg)]"
      >
        {children}
      </RoleShell>
    </RequireRole>
  );
}
