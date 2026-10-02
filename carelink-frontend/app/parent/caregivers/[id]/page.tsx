"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { ErrorState } from "@/components/ui/empty-state";
import { Button, LinkButton } from "@/components/ui/button";
import {
  CaregiverProfileView,
  type CaregiverProfile,
} from "@/components/parent/caregiver-profile-view";

// A read-only caregiver profile: who they are, their rating, experience,
// skills, languages and qualifications. Booking itself happens through
// the Request a Nanny flow (Home → Find Care), not from here — except
// for the two cases below, both arriving as a query param and both
// re-verified server-side before either action shows (never trusted
// from the URL alone):
//
// ?bookingId=... — from "View Nanny" on the just-matched/awaiting-
// payment screen (app/parent/care-requests/[id]/page.tsx). This
// caregiver IS the current assignment; shows "Pay & Confirm Booking"
// once GET /api/bookings/[id] confirms the booking is still 'accepted'
// and really is for this caregiver.
//
// ?careRequestId=... — from "Browse other caregivers"
// (ChooseAnotherNanny, same file), viewing a CANDIDATE who isn't
// assigned yet. Shows "Select & Continue to Payment", which performs
// the swap (POST .../dispatch/reselect) and only then moves on to
// payment for the new booking it creates.
type PendingBooking = {
  id: string;
  status: string;
  staff_profile_id: string;
  care_request_id: string | null;
};

type DispatchStatus = {
  activeOffer: { bookingId: string; staffProfileId: string } | null;
};

export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId");
  const careRequestId = searchParams.get("careRequestId");

  const [caregiver, setCaregiver] = useState<CaregiverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

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

  async function selectAndContinue() {
    if (!careRequestId) return;
    setSelecting(true);
    setSelectError(null);
    try {
      const res = await apiFetch<DispatchStatus>(
        `/api/care-requests/${careRequestId}/dispatch/reselect`,
        { method: "POST", body: { staffProfileId: id } },
      );
      if (!res.activeOffer) throw new Error("Could not assign this caregiver. Please try again.");
      router.push(`/parent/bookings/${res.activeOffer.bookingId}/pay`);
    } catch (err) {
      setSelectError(errorMessage(err));
      setSelecting(false);
    }
  }

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
            href={`/parent/bookings/${pendingBooking.id}/pay`}
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

      {careRequestId && !pendingBooking && (
        <div className="flex flex-col items-center gap-2">
          {selectError && <p className="text-[13px] text-error">{selectError}</p>}
          <Button
            onClick={() => void selectAndContinue()}
            disabled={selecting}
            className="w-full max-w-sm justify-center"
          >
            {selecting ? "Selecting…" : "Select & Continue to Payment"}
          </Button>
        </div>
      )}
    </div>
  );
}
