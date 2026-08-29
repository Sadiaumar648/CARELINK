"use client";

import Link from "next/link";
import { ArrowLeft, LockKey, ShieldCheck, EyeSlash } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";

const ITEMS = [
  {
    icon: LockKey,
    title: "Your Ward Profile is private",
    body: "Only you can see your children's full care profiles. A caregiver only sees the details of a booking they're confirmed for — never your full family information.",
  },
  {
    icon: ShieldCheck,
    title: "Caregivers are verified before they can accept bookings",
    body: "Every caregiver you see on CareLink has been through identity verification and is approved before they can appear in search or accept a booking.",
  },
  {
    icon: EyeSlash,
    title: "What we don't share",
    body: "Your exact home address, your child's medical information, and your emergency contacts are never shown publicly. A confirmed caregiver only sees what's needed to safely provide care for that booking.",
  },
];

export default function ParentSafetyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Profile
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Safety & Privacy</h1>
        <p className="text-[14px] text-ink-muted">
          How CareLink keeps your family&apos;s information safe.
        </p>
      </div>
      {ITEMS.map((item) => (
        <Sheet key={item.title} className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-pressed">
            <item.icon size={20} weight="duotone" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-ink">{item.title}</p>
            <p className="text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
          </div>
        </Sheet>
      ))}
    </div>
  );
}
