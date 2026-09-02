"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Fire,
  FirstAid,
  Flag,
  IdentificationCard,
  ShieldWarning,
  Siren,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { Sheet } from "@/components/ui/sheet";

type EmergencyContacts = { police: string | null; fire: string | null; medical: string | null };

const SAFETY_DISCLAIMER =
  "For immediate danger, contact the appropriate emergency service. CareLink Safety Team alerts are for CareLink follow-up and do not replace emergency services.";

function EmergencyNumberRow({
  icon: Icon,
  label,
  number,
}: {
  icon: typeof Siren;
  label: string;
  number: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={20} className="shrink-0 text-error" />
      <span className="text-[14px] text-ink">{label}</span>
      <span className="ml-auto text-[13px] font-semibold text-ink">
        {number ? (
          <a href={`tel:${number}`} className="text-wisteria hover:text-wisteria-hover">
            {number}
          </a>
        ) : (
          <span className="font-normal text-ink-muted">Not yet configured</span>
        )}
      </span>
    </div>
  );
}

export default function StaffSafetyPage() {
  const [contacts, setContacts] = useState<EmergencyContacts | null>(null);

  useEffect(() => {
    apiFetch<EmergencyContacts>("/api/settings/emergency-contacts")
      .then(setContacts)
      .catch(() => setContacts({ police: null, fire: null, medical: null }));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/staff/profile"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Profile
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Safety & Support</h1>
        <p className="text-[14px] text-ink-muted">
          Emergency options, reporting, and how CareLink protects your information.
        </p>
      </div>

      <Sheet className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold font-heading">
          <ShieldWarning size={20} weight="fill" className="text-error" />
          Emergency SOS
        </h2>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          During a confirmed or active booking, an SOS / Emergency option is available from the
          booking&apos;s Safety & Support section — it gives you one-tap access to police, fire,
          medical services, and an option to alert the CareLink Safety Team.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-muted">{SAFETY_DISCLAIMER}</p>
      </Sheet>

      <Sheet className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold font-heading">Emergency services</h2>
        <div className="flex flex-col gap-2.5">
          <EmergencyNumberRow icon={Siren} label="Police / Security" number={contacts?.police} />
          <EmergencyNumberRow icon={Fire} label="Fire & Rescue" number={contacts?.fire} />
          <EmergencyNumberRow icon={FirstAid} label="Medical" number={contacts?.medical} />
        </div>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <Flag size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Report a parent or a booking</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Open any booking from your Schedule and use the report option in its Safety & Support
            section — covers unsafe behaviour, harassment, an inappropriate request, incorrect
            booking information, a payment issue, or another concern. Reports go to CareLink
            administrators only; the parent never sees who filed it.
          </p>
        </div>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <IdentificationCard size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Your emergency contact</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Shared with a parent only during an active booking, for their safety and yours. Manage
            it from{" "}
            <Link
              href="/staff/profile"
              className="font-semibold text-wisteria hover:text-wisteria-hover"
            >
              your profile
            </Link>
            .
          </p>
        </div>
      </Sheet>

      <Sheet className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-ink">What we don&apos;t share</p>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          A family&apos;s exact address is only shared once you&apos;ve accepted their booking. Your
          identity documents, live verification photo, and emergency contact are never shown
          publicly.
        </p>
      </Sheet>
    </div>
  );
}
