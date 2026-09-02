"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  CreditCard,
  Flag,
  MagnifyingGlass,
  ShieldWarning,
  UserCircle,
} from "@phosphor-icons/react";
import { Accordion } from "@/components/ui/accordion";
import { Sheet } from "@/components/ui/sheet";

type FaqItem = {
  question: string;
  answer: string;
  category: "booking" | "payment" | "safety" | "account";
};

// Every answer describes real app behaviour only — nothing here claims
// a feature (a support phone line, a live-chat widget, a parent-facing
// SOS button) that doesn't actually exist elsewhere in the app.
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I request a caregiver?",
    answer:
      "Go to Find Care, open a caregiver's profile, and use Request Booking. Choose the child, date, time, and address, then review and send the request — it isn't confirmed until the caregiver accepts.",
    category: "booking",
  },
  {
    question: "How do I cancel a booking?",
    answer:
      "Open the booking from My Bookings and choose Cancel Booking. You can cancel while it's pending, accepted, or paid — once a session is active it can only be ended, not cancelled.",
    category: "booking",
  },
  {
    question: "How do I pay for a booking?",
    answer:
      "Once a caregiver accepts your request, open the booking and pay by MTN, Telecel, or AirtelTigo Mobile Money. You'll enter your network and number at the time of payment.",
    category: "payment",
  },
  {
    question: "How does caregiver verification work?",
    answer:
      "Caregivers submit a government ID, a live photo, and a reference contact. An administrator reviews every submission by hand before an account is marked verified — you'll see a Verified badge on their profile once that's done.",
    category: "account",
  },
  {
    question: "How does SafeTrack work?",
    answer:
      'During an active booking, a caregiver can choose to share their live location with you for the duration of that session only. You\'ll see "Caregiver location sharing: ON" and a last-updated time on the booking page — sharing stops automatically the moment the session ends.',
    category: "safety",
  },
  {
    question: "What happens if I have a problem with a caregiver?",
    answer:
      "Open the relevant booking and use the report option in its Safety & Support section. Reports go directly to CareLink administrators for review — the caregiver is never shown who filed it.",
    category: "safety",
  },
  {
    question: "How do I contact CareLink?",
    answer:
      "The most direct way is to report an issue from the specific booking it concerns — that reaches CareLink's admin team immediately. For general safety information, see Safety & Privacy below.",
    category: "account",
  },
  {
    question: "What should I do in an emergency?",
    answer:
      "For immediate danger, contact your local emergency services directly — CareLink is not an emergency-response service. If something feels wrong during a booking, report it from that booking afterward so CareLink can follow up.",
    category: "safety",
  },
];

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

  const filtered = FAQ_ITEMS.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Profile
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Help & Support</h1>
        <p className="text-[14px] text-ink-muted">
          Answers, safety information, and how to reach us.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
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

      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold font-heading">Frequently asked questions</h2>
        {filtered.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No help topics match &quot;{query}&quot;.</p>
        ) : (
          <Accordion items={filtered} />
        )}
      </div>
    </div>
  );
}
