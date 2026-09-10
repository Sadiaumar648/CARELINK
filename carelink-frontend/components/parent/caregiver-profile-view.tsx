"use client";

import { useState } from "react";
import { Star, Info, ShieldCheck, ClockCounterClockwise, SealCheck } from "@phosphor-icons/react";
import { hourlyRateFor } from "@carelink/shared";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/badge";
import { caregiverPhotoUrl } from "@/lib/photo-url";

export type CaregiverProfile = {
  staff_profile_id: string;
  user_id: string;
  full_name: string;
  verification_status: string;
  verification_method: "carelink" | "agency" | null;
  photo_path: string | null;
  caregiver_type: "nanny" | "babysitter" | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  languages: string[] | null;
  areas: { area: string; isPrimary: boolean }[];
  qualifications: {
    name: string;
    institution: string | null;
    year: number | null;
    verificationStatus: string;
  }[];
  bio: string | null;
};

// Every caregiver is presented to parents as a "Nanny" now.
function typeLabel(type: "nanny" | "babysitter" | null): string {
  return type ? "Nanny" : "Nanny";
}

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayRate(c: CaregiverProfile): number {
  return c.caregiver_type ? hourlyRateFor(c.caregiver_type) : c.hourly_rate;
}

// The read-only "who they are, their ratings, everything about them"
// profile — shared by the standalone /parent/caregivers/[id] page and
// the "View profile" step inside the Request a Nanny caregiver picker,
// so the parent sees exactly the same thing either way.
export function CaregiverProfileView({ caregiver }: { caregiver: CaregiverProfile }) {
  const [verificationInfoOpen, setVerificationInfoOpen] = useState(false);
  const primaryArea =
    caregiver.areas?.find((a) => a.isPrimary)?.area ?? caregiver.areas?.[0]?.area ?? null;
  const isVerified = caregiver.verification_status === "verified";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
      {/* LEFT: photo + core facts */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
          <Avatar
            photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
            name={caregiver.full_name}
            size="lg"
            className="h-32 w-32 lg:h-40 lg:w-40"
          />
          <div className="flex flex-col gap-1">
            <h1 className="text-[24px] font-semibold font-heading">{caregiver.full_name}</h1>
            {isVerified && (
              <div className="flex flex-col items-center gap-1 lg:items-start">
                <button
                  type="button"
                  onClick={() => setVerificationInfoOpen((o) => !o)}
                  className="flex items-center gap-1 text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                  aria-expanded={verificationInfoOpen}
                >
                  <VerificationBadge method={caregiver.verification_method} />
                  <Info size={14} />
                </button>
                {verificationInfoOpen && (
                  <p className="max-w-xs text-[12px] leading-relaxed text-ink-muted">
                    {caregiver.verification_method === "agency"
                      ? "This caregiver's identity was verified by the agency before joining CareLink."
                      : "Verification means the caregiver's submitted identity information has been reviewed according to CareLink's verification process."}
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="flex items-center gap-1 text-[14px] text-ink-muted">
            <Star size={15} weight="fill" className="text-gold" />
            <span className="font-semibold text-ink">
              {caregiver.rating_avg ? caregiver.rating_avg.toFixed(1) : "New"}
            </span>
            {caregiver.rating_count > 0 && <span>· {caregiver.rating_count} reviews</span>}
          </p>
          <p className="text-[13px] text-ink-muted">
            {typeLabel(caregiver.caregiver_type)} · {caregiver.years_experience ?? 0} yrs experience
            {primaryArea ? ` · ${primaryArea}` : ""}
          </p>
          <p className="text-[24px] font-semibold tabular-nums">
            GH₵{displayRate(caregiver)}
            <span className="text-[14px] font-normal text-ink-muted">/hr</span>
          </p>
        </div>
      </div>

      {/* RIGHT: about, experience, skills, languages, qualifications, trust */}
      <div className="flex flex-col gap-5">
        {caregiver.bio && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">
              About {caregiver.full_name.split(" ")[0]}
            </h2>
            <p className="text-[14px] leading-relaxed text-ink">{caregiver.bio}</p>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold font-heading">Experience</h2>
          <p className="text-[14px] text-ink-muted">
            {caregiver.years_experience ?? 0} years of childcare experience
          </p>
          {caregiver.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {caregiver.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-wisteria-tint px-3 py-1 text-[12.5px] font-medium text-wisteria-pressed"
                >
                  {skillLabel(s)}
                </span>
              ))}
            </div>
          )}
        </section>

        {caregiver.languages && caregiver.languages.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">Languages</h2>
            <p className="text-[14px] text-ink-muted">{caregiver.languages.join(", ")}</p>
          </section>
        )}

        {caregiver.qualifications.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">
              Qualifications &amp; Certifications
            </h2>
            <ul className="flex flex-col gap-1.5">
              {caregiver.qualifications.map((q, i) => (
                <li key={i} className="flex items-center gap-2 text-[14px] text-ink-muted">
                  {q.verificationStatus === "verified" && (
                    <SealCheck
                      size={14}
                      weight="fill"
                      className="shrink-0 text-[var(--color-success)]"
                    />
                  )}
                  <span>
                    {q.name}
                    {q.institution ? ` — ${q.institution}` : ""}
                    {q.year ? ` (${q.year})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold font-heading">Availability</h2>
          <p className="flex items-start gap-2 text-[13px] text-ink-muted">
            <ClockCounterClockwise size={16} className="mt-0.5 shrink-0" />
            Availability is checked against your requested date and time when your request is sent.
          </p>
        </section>

        <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <ShieldCheck size={15} className="shrink-0 text-wisteria" />
          Verified identity, structured Mobile Money payments, and post-booking ratings keep every
          CareLink booking accountable.
        </p>
      </div>
    </div>
  );
}
