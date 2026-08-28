import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { VerificationBadge } from "@/components/ui/badge";

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CaregiverCard({
  href,
  photoUrl,
  name,
  verified,
  yearsExperience,
  area,
  hourlyRate,
  ratingAvg,
  ratingCount,
  skills,
  matchScore,
}: {
  href: string;
  photoUrl: string | null;
  name: string;
  verified: boolean;
  yearsExperience: number | null;
  area?: string | null;
  hourlyRate?: number;
  ratingAvg: number | null;
  ratingCount: number;
  skills: string[];
  matchScore?: number;
}) {
  return (
    <Sheet className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar photoUrl={photoUrl} name={name} size="sm" />
          <div>
            <p className="text-[16px] font-semibold font-heading">{name}</p>
            <p className="text-[13px] text-ink-muted">Caregiver</p>
          </div>
        </div>
        {verified && <VerificationBadge />}
      </div>

      <RatingStars rating={ratingAvg} reviewCount={ratingCount} />

      <p className="text-[13px] text-ink-muted">
        {yearsExperience ?? 0} yrs experience{area ? ` · ${area}` : ""}
      </p>

      <div className="flex flex-wrap gap-2">
        {skills.slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-full bg-sage-tint px-3 py-1 text-[12px] text-sage-pressed"
          >
            {skillLabel(s)}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <div>
          {hourlyRate !== undefined && (
            <p className="text-[17px] font-semibold tabular-nums">GH₵{hourlyRate}/hr</p>
          )}
          {matchScore !== undefined && (
            <p className="text-[12px] font-semibold text-sage">{Math.round(matchScore)}% Match</p>
          )}
        </div>
        <Link href={href} className="text-[14px] font-semibold text-sage hover:text-sage-hover">
          View Profile →
        </Link>
      </div>
    </Sheet>
  );
}
