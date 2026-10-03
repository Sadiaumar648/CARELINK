"use client";

import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { VerificationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { caregiverPhotoUrl } from "@/lib/photo-url";

// One CareLink nanny in a "Recommended Nannies" list — the same card in
// the Request a Nanny picker and on the request-tracking "choose another
// nanny" screen. Every field comes straight from
// GET /api/search/caregivers (public_caregivers view); nothing here is
// fabricated.
export type RecommendedNanny = {
  staff_profile_id: string;
  full_name: string;
  photo_path?: string | null;
  rating_avg?: number | null;
  rating_count?: number;
  years_experience?: number | null;
  bookings_completed?: number;
  verification_status?: string;
  verification_method?: "carelink" | "agency" | null;
  bio?: string | null;
  areas?: { area: string; isPrimary: boolean }[];
};

export function NannyCard({
  nanny,
  onRequest,
  onViewProfile,
  requesting = false,
  disabled = false,
  highlighted = false,
  highlightLabel,
}: {
  nanny: RecommendedNanny;
  onRequest: () => void;
  onViewProfile: () => void;
  requesting?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  highlightLabel?: string;
}) {
  // No base location shown here any more — dispatch matches a parent
  // with the best available caregiver irrespective of where either of
  // them is based, so a caregiver's area is no longer something that
  // determines or explains a match.
  const facts = [
    nanny.years_experience != null ? `${nanny.years_experience} yrs experience` : null,
    nanny.bookings_completed != null ? `${nanny.bookings_completed} completed care` : null,
  ].filter(Boolean);

  return (
    <div
      className={`flex flex-col gap-3 rounded-[12px] border p-3 ${
        highlighted ? "border-wisteria bg-wisteria-tint" : "border-[var(--color-lavender-border)]"
      }`}
    >
      {highlighted && highlightLabel && (
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-wisteria">
          {highlightLabel}
        </p>
      )}
      <div className="flex items-start gap-3">
        <Avatar
          photoUrl={caregiverPhotoUrl(nanny.photo_path ?? null)}
          name={nanny.full_name}
          size="sm"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-semibold text-ink">{nanny.full_name}</p>
            {nanny.verification_status === "verified" && (
              <VerificationBadge method={nanny.verification_method} />
            )}
          </div>
          <RatingStars rating={nanny.rating_avg ?? null} reviewCount={nanny.rating_count} />
          {facts.length > 0 && <p className="text-[12px] text-ink-muted">{facts.join(" · ")}</p>}
        </div>
      </div>
      {nanny.bio && (
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">{nanny.bio}</p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={onRequest}
          className="flex-1 justify-center"
        >
          {requesting ? "Sending…" : "Request This Nanny"}
        </Button>
        <button
          type="button"
          onClick={onViewProfile}
          className="rounded-[10px] border border-[var(--color-lavender-border)] px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-wisteria hover:text-wisteria"
        >
          View Profile
        </button>
      </div>
    </div>
  );
}
