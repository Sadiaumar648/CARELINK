"use client";

import { use, useEffect, useState } from "react";
import { Star } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";

type Caregiver = {
  staff_profile_id: string;
  full_name: string;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  bio: string | null;
};

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ caregiver: Caregiver }>(`/api/caregivers/${id}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <p className="p-6 text-[13px] text-magenta">{error}</p>;
  if (!caregiver) return <p className="p-6 text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-[26px] font-semibold">{caregiver.full_name}</h1>
        <p className="flex items-center gap-1 text-[15px] text-ink-muted">
          <Star size={16} weight="fill" />
          {caregiver.rating_avg ? caregiver.rating_avg.toFixed(1) : "New"} ({caregiver.rating_count}{" "}
          reviews) · {caregiver.years_experience ?? 0} yrs experience
        </p>
      </div>

      <Sheet className="flex flex-col gap-4">
        <p className="text-[28px] font-semibold tabular-nums">GH₵{caregiver.hourly_rate}/hr</p>
        <div className="flex flex-wrap gap-2">
          {caregiver.skills.map((s) => (
            <span key={s} className="rounded bg-hairline/40 px-2 py-1 text-[13px] text-ink-muted">
              {skillLabel(s)}
            </span>
          ))}
        </div>
        {caregiver.bio && <p className="text-[15px] leading-relaxed">{caregiver.bio}</p>}
      </Sheet>
    </div>
  );
}
