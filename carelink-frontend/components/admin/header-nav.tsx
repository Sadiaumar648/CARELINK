"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "@phosphor-icons/react/dist/ssr";
import {
  SquaresFour,
  MagnifyingGlass,
  UsersThree,
  Baby,
  CalendarCheck,
  CreditCard,
  Star,
  Flag,
  GearSix,
} from "@phosphor-icons/react";

// Same logo pattern as components/parent/header-nav.tsx and
// components/staff/header-nav.tsx — Admin keeps its desktop sidebar
// (this is still an information-dense operations dashboard), so this
// slots into RoleShell's `headerLeft`, above the rail, not replacing it.
export function AdminHeaderLogo() {
  return (
    <Link href="/admin" className="flex items-center gap-2">
      <Heart size={22} weight="fill" className="text-wisteria" />
      <span className="text-[16px] font-semibold font-heading text-ink">CareLink Admin</span>
    </Link>
  );
}

// The full desktop header navigation row, alongside the logo (see
// AdminHeaderLogo above — both render together in RoleShell's
// headerLeft slot). Hidden below `lg` — the existing mobile bottom tab
// bar (admin/layout.tsx's own curated 6-item mobileItems) is the real
// responsive nav on narrower screens, unchanged by this. Every href
// here is a real, already-existing admin route except /admin/payments,
// which this same change adds as a genuine read-only page over the
// real (existing) payments table — nothing here links anywhere that
// doesn't actually exist.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: SquaresFour },
  { href: "/admin/care-requests", label: "Care", icon: MagnifyingGlass },
  { href: "/admin/roster", label: "Caregivers", icon: UsersThree },
  { href: "/admin/users", label: "Families", icon: Baby },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/settings", label: "Settings", icon: GearSix },
] as const;

export function AdminHeaderNav() {
  const pathname = usePathname();

  const activeHref = NAV_ITEMS.map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold ${
              active
                ? "bg-wisteria-tint text-wisteria"
                : "text-ink-muted hover:bg-wisteria-tint hover:text-ink"
            }`}
          >
            <Icon size={16} weight={active ? "fill" : "regular"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
