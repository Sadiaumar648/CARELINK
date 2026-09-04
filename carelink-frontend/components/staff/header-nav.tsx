import Link from "next/link";
import { ChatCircle, Heart } from "@phosphor-icons/react/dist/ssr";

// The header's left-side logo — same pattern as
// components/parent/header-nav.tsx's ParentHeaderLogo, for the same
// reason: this role has no desktop sidebar to put a logo in once the
// rail is hidden (RoleShell's `headerLeft` slot instead).
export function StaffHeaderLogo() {
  return (
    <Link href="/staff" className="flex items-center gap-2">
      <Heart size={22} weight="fill" className="text-wisteria" />
      <span className="text-[16px] font-semibold font-heading text-ink">CareLink</span>
    </Link>
  );
}

// Chat → Messages: a real existing route, not new functionality. No
// unread-message badge, same reasoning as the parent equivalent — no
// aggregate unread-message count exists anywhere in the backend.
export function StaffHeaderIcons() {
  return (
    <Link
      href="/staff/messages"
      aria-label="Messages"
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
    >
      <ChatCircle size={19} />
    </Link>
  );
}
