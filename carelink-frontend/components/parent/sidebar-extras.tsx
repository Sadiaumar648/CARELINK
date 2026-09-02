import Link from "next/link";
import { Headset, Heart, ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import { LinkButton } from "@/components/ui/button";

// The parent sidebar's logo block (desktop rail only — RoleShell's
// `sidebarHeader` slot).
export function ParentSidebarHeader() {
  return (
    <div className="flex flex-col gap-0.5 px-3">
      <span className="flex items-center gap-2 text-[17px] font-semibold font-heading text-ink">
        <Heart size={22} weight="fill" className="text-wisteria" />
        CareLink
      </span>
      <span className="text-[11px] font-medium text-ink-muted">Care with Confidence</span>
    </div>
  );
}

// The parent sidebar's footer block (desktop rail only — RoleShell's
// `sidebarFooter` slot, rendered above the existing Sign out button).
//
// Both links point at real, existing pages rather than inventing new
// functionality: there is no phone/live-chat support channel anywhere
// in the app today (see /parent/help's own note to that effect), and
// the only real SOS trigger (SosScreen) is mounted inside an active
// booking's detail page by design — there's no global always-on SOS
// mechanism, so this links to the informational Safety page instead of
// fabricating one.
export function ParentSidebarFooter() {
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-col gap-2 rounded-[14px] bg-wisteria-tint p-4">
        <p className="text-[13px] font-semibold text-ink">Need help?</p>
        <p className="text-[12px] text-ink-muted">We&apos;re here 24/7 for you.</p>
        <LinkButton
          href="/parent/help"
          variant="secondary"
          className="justify-center gap-1.5 border-wisteria/25 bg-sheet text-[12.5px] text-wisteria hover:border-wisteria"
        >
          <Headset size={15} weight="fill" />
          Contact Support
        </LinkButton>
      </div>
      <Link
        href="/parent/safety"
        className="flex items-center gap-2 rounded-[10px] bg-error-tint px-3 py-2.5 text-[13px] font-semibold text-error hover:opacity-85"
      >
        <ShieldWarning size={17} weight="fill" />
        Emergency / SOS
      </Link>
    </div>
  );
}
