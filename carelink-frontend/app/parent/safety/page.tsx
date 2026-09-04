"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LockKey, ShieldCheck, EyeSlash } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";

const ITEMS = [
  {
    icon: LockKey,
    title: "Your Ward Profile is private",
    body: "Only you can see your children's full care profiles. Caregivers only see the information needed to review and provide care for a request or confirmed booking.",
  },
  {
    icon: ShieldCheck,
    title: "Caregivers are verified before they can accept bookings",
    body: "Every caregiver eligible for CareLink requests has completed identity verification and been approved by the agency before they can receive or accept a booking.",
  },
  {
    icon: EyeSlash,
    title: "What we don't share",
    body: "Your exact home address, your child's medical information, and your emergency contacts are never shown publicly. Caregivers only receive the information needed to safely provide care.",
  },
];

function ParentSafetyPage() {
  // Reached from two real entry points — Home's "Learn about safety"
  // button and Settings' "Safety & Privacy" row — each wants the parent
  // to return to where they actually came from, not always through
  // Settings. `?from=home` is only ever set by the Home link below;
  // absent (including a direct visit or the Settings link) keeps the
  // existing Back to Settings behaviour.
  const fromHome = useSearchParams().get("from") === "home";
  const backHref = fromHome ? "/parent" : "/parent/account";
  const backLabel = fromHome ? "Back to Home" : "Back to Settings";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> {backLabel}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Safety & Privacy</h1>
        <p className="text-[14px] text-ink-muted">
          How CareLink keeps your family&apos;s information safe.
        </p>
      </div>
      {ITEMS.map((item) => (
        <Sheet key={item.title} className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
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

export default function ParentSafetyPageWrapper() {
  return (
    <Suspense>
      <ParentSafetyPage />
    </Suspense>
  );
}
