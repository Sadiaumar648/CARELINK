import Link from "next/link";
import { Heart } from "@phosphor-icons/react/dist/ssr";

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
