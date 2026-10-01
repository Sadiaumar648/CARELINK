"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { ErrorState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import {
  CaregiverProfileView,
  type CaregiverProfile,
} from "@/components/parent/caregiver-profile-view";

// A read-only caregiver profile: who they are, their rating, experience,
// skills, languages and qualifications. Booking itself happens through
// the Request a Nanny flow (Home → Find Care), not from here.
//
// The one exception: arriving here with ?bookingId=... (from "View
// Nanny" on the just-matched/awaiting-payment screen,
// app/parent/care-requests/[id]/page.tsx) adds a "Pay & Confirm
// Booking" action and a "Browse other caregivers" override beneath the
// profile — never trusted from the URL alone, always re-verified
// against the real booking (GET /api/bookings/[id], RLS-scoped to the
// caller's own bookings) before either shows: it must still be
// 'accepted' (matched, unpaid) and actually be for this caregiver.
type PendingBooking = {
  id: string;
  status: string;
  staff_profile_id: string;
  care_request_id: string | null;
};

export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId");

  const [caregiver, setCaregiver] = useState<CaregiverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);

  useEffect(() => {
    apiFetch<{ caregiver: CaregiverProfile }>(`/api/caregivers/${id}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setError(errorMessage(err)));
  }, [id, retryKey]);

  useEffect(() => {
    if (!bookingId) {
      void Promise.resolve().then(() => setPendingBooking(null));
      return;
    }
    let cancelled = false;
    apiFetch<{ booking: PendingBooking }>(`/api/bookings/${bookingId}`)
      .then((res) => {
        if (cancelled) return;
        const b = res.booking;
        setPendingBooking(b.status === "accepted" && b.staff_profile_id === id ? b : null);
      })
      .catch(() => {
        if (!cancelled) setPendingBooking(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, id]);

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
      <CaregiverProfileView caregiver={caregiver} />

      {pendingBooking && (
        <div className="flex flex-col items-center gap-2">
          <LinkButton
            href={`/parent/bookings/${pendingBooking.id}`}
            className="w-full max-w-sm justify-center"
          >
            Pay &amp; Confirm Booking
          </LinkButton>
          {pendingBooking.care_request_id && (
            <Link
              href={`/parent/care-requests/${pendingBooking.care_request_id}?reselect=1`}
              className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              Not the right fit? Browse other caregivers
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
