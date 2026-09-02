import Link from "next/link";
import { ChatCircle, Heart } from "@phosphor-icons/react/dist/ssr";

// The header's left-side logo — this role has no desktop sidebar to put
// it in (RoleShell's `headerLeft` slot instead), so it renders here.
export function ParentHeaderLogo() {
  return (
    <Link href="/parent" className="flex items-center gap-2">
      <Heart size={22} weight="fill" className="text-wisteria" />
      <span className="text-[16px] font-semibold font-heading text-ink">CareLink</span>
    </Link>
  );
}

// Chat → Messages: a real existing route, not new functionality. No
// unread-message badge — there is no aggregate unread-message count
// anywhere in the backend (only notifications has one, already used by
// the bell), so a badge here would be fabricated data rather than a
// real signal.
export function ParentHeaderIcons() {
  return (
    <Link
      href="/parent/messages"
      aria-label="Messages"
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
    >
      <ChatCircle size={19} />
    </Link>
  );
}
