"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { ErrorState } from "@/components/ui/empty-state";
import {
  CaregiverProfileView,
  type CaregiverProfile,
} from "@/components/parent/caregiver-profile-view";

// A read-only caregiver profile: who they are, their rating, experience,
// skills, languages and qualifications. Booking happens through the
// Request a Nanny flow (Home → Find Care → Choose a caregiver), not
// from here — there's no request form and no "report a concern" widget
// on this page any more.
export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [caregiver, setCaregiver] = useState<CaregiverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ caregiver: CaregiverProfile }>(`/api/caregivers/${id}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setError(errorMessage(err)));
  }, [id, retryKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (!caregiver) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <div className="h-28 w-28 animate-pulse rounded-full bg-hairline/60" />
          <div className="flex flex-col gap-2">
            <div className="h-6 w-40 animate-pulse rounded bg-hairline/60" />
            <div className="h-4 w-56 animate-pulse rounded bg-hairline/60" />
          </div>
        </div>
        <div className="h-40 animate-pulse rounded-[18px] bg-hairline/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <CaregiverProfileView caregiver={caregiver} />
    </div>
  );
}
