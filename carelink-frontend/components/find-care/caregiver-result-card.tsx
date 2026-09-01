"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { VerificationBadge } from "@/components/ui/badge";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { caregiverTypeLabel, skillLabel, type CaregiverResult, type SearchFilters } from "./types";

// Every reason here is grounded in something the backend actually did:
// the hard filters in GET /api/search/caregivers exclude a candidate
// entirely unless they satisfy area/date+time/skills/budget/experience,
// so any of those the parent actually set is true of every remaining
// result, not a soft guess. Rating is the one purely observational one.
function matchReasons(caregiver: CaregiverResult, applied: SearchFilters): string[] {
  const reasons: string[] = [];
  const primaryArea = caregiver.areas?.find((a) => a.isPrimary)?.area ?? caregiver.areas?.[0]?.area;

  if (applied.date && applied.startTime && applied.endTime) {
    reasons.push("Available at your requested time");
  }
  if (applied.area && primaryArea) {
    reasons.push(`Works in ${primaryArea}`);
  }
  if (applied.skills?.length) {
    reasons.push(`Experienced with ${applied.skills.map(skillLabel).join(", ")}`);
  }
  if (applied.budgetCeiling) {
    reasons.push(`Within your GH₵${applied.budgetCeiling}/hr budget`);
  }
  if (applied.minExperience) {
    reasons.push(`${applied.minExperience}+ years of experience`);
  }
  if (caregiver.rating_count > 0 && caregiver.rating_avg && caregiver.rating_avg >= 4.5) {
    reasons.push(`Highly rated — ${caregiver.rating_avg.toFixed(1)} stars`);
  }
  return reasons;
}

export function CaregiverResultCard({
  caregiver,
  appliedFilters,
}: {
  caregiver: CaregiverResult;
  appliedFilters: SearchFilters;
}) {
  const [expanded, setExpanded] = useState(false);
  const primaryArea =
    caregiver.areas?.find((a) => a.isPrimary)?.area ?? caregiver.areas?.[0]?.area ?? null;
  const reasons = matchReasons(caregiver, appliedFilters);

  return (
    <Sheet className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar
            photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
            name={caregiver.full_name}
            size="sm"
          />
          <div>
            <Link
              href={`/parent/caregivers/${caregiver.staff_profile_id}`}
              className="text-[15px] font-semibold font-heading hover:text-sage"
            >
              {caregiver.full_name}
            </Link>
            <p className="text-[12px] text-ink-muted">
              {caregiverTypeLabel(caregiver.caregiver_type)
                ? `${caregiverTypeLabel(caregiver.caregiver_type)} · `
                : ""}
              {caregiver.years_experience ?? 0} yrs
              {primaryArea ? ` · ${primaryArea}` : ""}
            </p>
          </div>
        </div>
        {caregiver.verification_status === "verified" && (
          <VerificationBadge method={caregiver.verification_method} />
        )}
      </div>

      <RatingStars rating={caregiver.rating_avg} reviewCount={caregiver.rating_count} />

      {caregiver.bio && (
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">{caregiver.bio}</p>
      )}

      {caregiver.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {caregiver.skills.slice(0, 3).map((s) => (
            <span
              key={s}
              className="rounded-full bg-sage-tint px-2.5 py-0.5 text-[11.5px] text-sage-pressed"
            >
              {skillLabel(s)}
            </span>
          ))}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="border-t border-hairline pt-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sage hover:text-sage-hover"
          >
            <CaretDown
              size={13}
              className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
            />
            Why this caregiver?
          </button>
          {expanded && (
            <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-ink-muted">
              {reasons.slice(0, 3).map((r) => (
                <li key={r}>✓ {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Pinned to the bottom of the card regardless of how much sits
          above it, so every card in the row lines its buttons up. */}
      <div className="mt-auto flex items-center justify-between border-t border-hairline pt-3">
        <div>
          <p className="text-[15px] font-semibold tabular-nums">GH₵{caregiver.hourly_rate}/hr</p>
          <p className="text-[11.5px] font-semibold text-sage">
            {Math.round(caregiver.matchScore)}% Match
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/parent/caregivers/${caregiver.staff_profile_id}`}
            className="rounded-[10px] border border-hairline px-2.5 py-1.5 text-[12.5px] font-semibold text-ink hover:border-sage hover:text-sage"
          >
            View Profile
          </Link>
          <Link
            href={`/parent/caregivers/${caregiver.staff_profile_id}#request-booking`}
            className="rounded-[10px] bg-sage px-3 py-1.5 text-[12.5px] font-semibold text-sheet hover:bg-sage-hover"
          >
            Request
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
