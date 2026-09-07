import Link from "next/link";
import { Heart } from "@phosphor-icons/react/dist/ssr";

// Same logo pattern as components/parent/header-nav.tsx and
// components/staff/header-nav.tsx. Per the current Admin Home direction,
// the header carries ONLY this logo (left) and AdminHeaderProfile
// (right) — no nav-links row, no notification bell. The mobile bottom
// tab bar (admin/layout.tsx's own curated mobileItems) remains the real
// navigation surface on narrower screens, where there's no header nav
// to fall back from in the first place.
export function AdminHeaderLogo() {
  return (
    <Link href="/admin" className="flex items-center gap-2">
      <Heart size={22} weight="fill" className="text-wisteria" />
      <span className="text-[16px] font-semibold font-heading text-ink">CareLink</span>
    </Link>
  );
}
