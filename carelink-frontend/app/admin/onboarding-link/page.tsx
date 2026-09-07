"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link as LinkIcon, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";

// "Generate Caregiver Onboarding Link" — this page is a real UI shell
// over functionality that does not exist in the backend yet. Inspected
// first, thoroughly: no onboarding-link table, no generate/list/
// deactivate route, and no /caregiver/join registration page exist
// anywhere in this codebase (grepped for onboarding_link,
// onboarding_token, registration_link, agency_link, "join/" — zero
// matches). Per this task's own instruction ("if it does NOT exist, do
// NOT invent a database schema without first telling me what is
// missing"), that backend is deliberately NOT built here — see the
// notice below and the report for the proposed design, which needs
// separate approval before any migration is written.
//
// "Agency" is shown as a static label, not a database lookup: CareLink
// is a single agency's platform (the agency-controlled model this
// product settled on), not a multi-tenant system with a per-admin
// agency record to query — there is exactly one real agency to name
// here, so this isn't a fabricated value, just not a fetched one.

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "none", label: "No expiry" },
] as const;

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
      >
        {children}
      </select>
    </div>
  );
}

export default function AdminOnboardingLinkPage() {
  const [expiry, setExpiry] = useState("30");
  const [maxRegistrations, setMaxRegistrations] = useState(100);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">
          Generate Caregiver Onboarding Link
        </h1>
        <p className="text-[14px] text-ink-muted">
          Create a secure registration link for your agency caregivers.
        </p>
      </div>

      <Sheet className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bluebell-tint text-[var(--color-bluebell-pressed)]">
            <LinkIcon size={19} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold text-ink">Create onboarding link</h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Generate a secure link that you can share with your agency caregivers. Each caregiver
              will use the link to create their own account and complete their registration.
            </p>
          </div>
        </div>

        <Field label="Agency" value="CareLink Agency" readOnly disabled />
        <p className="-mt-4 text-[12.5px] text-ink-muted">
          Caregivers registering through this link will be associated with your agency.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Link expiry" value={expiry} onChange={setExpiry}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col gap-2">
            <Field
              label="Maximum registrations"
              type="number"
              min={1}
              value={maxRegistrations}
              onChange={(e) => setMaxRegistrations(Number(e.target.value))}
            />
            <p className="text-[12.5px] text-ink-muted">
              The link can be used until the registration limit is reached.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" disabled className="w-fit">
            Generate Link
          </Button>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            <WarningCircle size={15} className="mt-0.5 shrink-0 text-gold" />
            Link generation isn&apos;t connected yet — it needs a small backend addition (a place to
            store and validate real onboarding links) that hasn&apos;t been built. Nothing here is
            faked; this form is ready to wire up once that exists.
          </p>
        </div>
      </Sheet>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bluebell-tint text-[var(--color-bluebell-pressed)]">
            <LinkIcon size={19} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold text-ink">Active onboarding links</h2>
            <p className="text-[13px] text-ink-muted">
              View and manage your existing onboarding links.
            </p>
          </div>
        </div>
      </div>

      <Sheet>
        <EmptyState
          icon={LinkIcon}
          title="No active onboarding links"
          description="Generate a link to begin onboarding your agency caregivers."
        />
      </Sheet>
    </div>
  );
}
