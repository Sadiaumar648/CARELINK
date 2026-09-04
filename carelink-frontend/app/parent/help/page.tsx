import Link from "next/link";
import { ArrowLeft, Envelope, Phone, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { Sheet } from "@/components/ui/sheet";

// CareLink's real, given support contact details — the one place
// they're defined, so the email/phone/WhatsApp links below always stay
// in sync with each other. Nothing here is invented: no business
// hours, no additional channels beyond what CareLink actually gave.
const SUPPORT_EMAIL = "support@carelink.com";
const SUPPORT_PHONE_DISPLAY = "+233 59 737 7124";
const SUPPORT_PHONE_TEL = "+233597377124";
const SUPPORT_PHONE_WHATSAPP = "233597377124";

const CONTACT_METHODS = [
  {
    icon: Envelope,
    label: "Email",
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
  },
  {
    icon: Phone,
    label: "Phone",
    value: SUPPORT_PHONE_DISPLAY,
    href: `tel:${SUPPORT_PHONE_TEL}`,
  },
  {
    icon: WhatsappLogo,
    label: "WhatsApp",
    value: SUPPORT_PHONE_DISPLAY,
    href: `https://wa.me/${SUPPORT_PHONE_WHATSAPP}`,
  },
];

// General FAQs live on the public homepage (app/page.tsx, #faq) and
// everything else — profile, ward profiles, bookings, safety/privacy,
// payment methods — already has its own place in Settings. This page
// is deliberately just one thing: how to reach CareLink directly.
export default function ParentHelpPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Help & Support</h1>
        <p className="text-[14px] text-ink-muted">
          Need help with CareLink? Our support team is here to assist.
        </p>
      </div>

      <Sheet className="flex flex-col gap-4 bg-wisteria-tint">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-wisteria-pressed">
            Need more help?
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[19px] font-semibold font-heading text-ink">
              Contact CareLink Support
            </p>
            <p className="text-[13px] text-ink-muted">
              Can&apos;t find what you&apos;re looking for? Our team is here to help.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {CONTACT_METHODS.map((method) => (
            <a
              key={method.label}
              href={method.href}
              target={method.label === "WhatsApp" ? "_blank" : undefined}
              rel={method.label === "WhatsApp" ? "noopener noreferrer" : undefined}
              className="flex min-h-[52px] items-center gap-3 rounded-[12px] border border-wisteria/25 bg-sheet px-4 py-3 transition-colors hover:border-wisteria"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
                <method.icon size={18} weight="fill" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  {method.label}
                </span>
                <span className="text-[14.5px] font-semibold tabular-nums text-ink">
                  {method.value}
                </span>
              </div>
            </a>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
