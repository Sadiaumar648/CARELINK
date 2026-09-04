"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  ChatCircleText,
  CreditCard,
  Envelope,
  Flag,
  MagnifyingGlass,
  ShieldWarning,
  UserCircle,
} from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";

// General FAQ content lives on the public homepage (app/page.tsx,
// #faq) — this authenticated page deliberately doesn't duplicate it;
// see the "View Frequently Asked Questions" section at the bottom,
// which links there instead. This page focuses on practical support
// while actually using CareLink: quick links into the real features
// each topic is about, plus how to reach support directly.
const QUICK_LINKS = [
  {
    icon: ShieldWarning,
    title: "Safety & Help",
    description:
      "How CareLink protects your family's information and what to do if something feels wrong.",
    href: "/parent/safety",
  },
  {
    icon: Flag,
    title: "Report a problem",
    description:
      "Report a specific caregiver or booking issue — open the booking and use its report option.",
    href: "/parent/bookings",
  },
  {
    icon: CalendarCheck,
    title: "Booking help",
    description: "Requesting, tracking, and cancelling a booking.",
    href: "/parent/bookings",
  },
  {
    icon: CreditCard,
    title: "Payment help",
    description: "How Mobile Money payments work for a booking.",
    href: "/parent/payment-methods",
  },
  {
    icon: UserCircle,
    title: "Account help",
    description: "Your profile, identity verification, and ward profiles.",
    href: "/parent/account",
  },
];

export default function ParentHelpPage() {
  const [query, setQuery] = useState("");

  const filtered = QUICK_LINKS.filter((link) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return link.title.toLowerCase().includes(q) || link.description.toLowerCase().includes(q);
  });

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
          Get answers, find helpful resources, or contact our support team.
        </p>
      </div>

      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help topics"
          aria-label="Search help topics"
          className="w-full rounded-[10px] border border-hairline bg-sheet py-2 pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No help topics match &quot;{query}&quot;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((link) => (
            <Link key={link.title} href={link.href}>
              <Sheet className="flex h-full items-start gap-3 hover:border-wisteria/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
                  <link.icon size={18} weight="duotone" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[14px] font-semibold text-ink">{link.title}</p>
                  <p className="text-[12.5px] leading-relaxed text-ink-muted">{link.description}</p>
                </div>
              </Sheet>
            </Link>
          ))}
        </div>
      )}

      {/* Need more help? — restrained, one step up visually from the
          quick-link cards above, matching this app's existing tinted
          "highlight" treatment (e.g. the Ward Profiles privacy notice)
          rather than a new visual language. No real, general (not
          booking-specific) support contact channel exists anywhere in
          this project today — the only actual contact mechanism is the
          per-booking report option already linked above — so this is
          intentionally a clearly-labelled placeholder, never a
          fabricated email/phone/response-time claim or a button that
          would silently do nothing. */}
      <Sheet className="flex flex-col gap-3 bg-wisteria-tint">
        <div className="flex items-center gap-2">
          <ChatCircleText size={18} weight="fill" className="text-wisteria-pressed" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-wisteria-pressed">
            Need more help?
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[16px] font-semibold text-ink">Contact CareLink Support</p>
          <p className="text-[13px] text-ink-muted">
            Can&apos;t find what you&apos;re looking for? Our team is here to help.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-wisteria/40 bg-sheet px-3 py-2.5">
          <Envelope size={16} className="shrink-0 text-ink-muted" />
          <span className="text-[13px] text-ink-muted">
            [Add CareLink&apos;s support email here]
          </span>
        </div>
        <p className="text-[11.5px] text-ink-muted">
          Placeholder — replace with CareLink&apos;s real support contact once available.
        </p>
      </Sheet>

      {/* Compact, secondary — deliberately smaller and quieter than the
          section above, and never a duplicate of the FAQ content
          itself, which stays on the public homepage only. */}
      <div className="flex flex-col gap-2 border-t border-hairline pt-5">
        <p className="text-[13px] font-semibold text-ink">View Frequently Asked Questions</p>
        <p className="text-[12.5px] text-ink-muted">
          Visit the main CareLink website for general FAQs about CareLink, our services, and how it
          works.
        </p>
        <Link
          href="/#faq"
          className="self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
        >
          Open FAQs →
        </Link>
      </div>
    </div>
  );
}
