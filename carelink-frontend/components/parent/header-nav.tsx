import Link from "next/link";
import { ChatCircle, Heart, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

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

// Search → Find Care, Chat → Messages: real existing routes, not new
// functionality. No unread-message badge on the chat icon — there is no
// aggregate unread-message count anywhere in the backend (only
// notifications has one, already used by the bell), so a badge here
// would be fabricated data rather than a real signal.
export function ParentHeaderIcons() {
  return (
    <>
      <Link
        href="/parent/find-care"
        aria-label="Find Care"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
      >
        <MagnifyingGlass size={19} />
      </Link>
      <Link
        href="/parent/messages"
        aria-label="Messages"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
      >
        <ChatCircle size={19} />
      </Link>
    </>
  );
}
