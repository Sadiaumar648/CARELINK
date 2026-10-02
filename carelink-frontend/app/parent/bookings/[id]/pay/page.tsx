"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { ErrorState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { PaymentForm } from "@/components/parent/payment-form";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type Booking = {
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  duration_days: number | null;
  hourly_rate: number;
  total_amount: number;
  status: string;
};

type CaregiverBrief = {
  full_name: string;
  photo_path: string | null;
};

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time(startsAt)} – ${time(endsAt)}`;
}

// A focused "make payment" screen, on its own — not nested inside the
// wider booking-detail/My Bookings experience. Reached from "Pay &
// Confirm Booking" wherever that appears (the caregiver's profile,
// mainly); components/booking-detail.tsx itself redirects any parent
// who lands there while still unpaid straight back here, so this is
// the one real place a booking actually gets paid for.
export default function PayForBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ booking: Booking }>(`/api/bookings/${id}`)
      .then((res) => {
        setError(null);
        setBooking(res.booking);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id, retryKey]);

  const staffProfileId = booking?.staff_profile_id;
  useEffect(() => {
    if (!staffProfileId) return;
    apiFetch<{ caregiver: CaregiverBrief }>(`/api/caregivers/${staffProfileId}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch(() => undefined);
  }, [staffProfileId]);

  // Already paid (or further along) by the time this loads — nothing
  // left to pay for here, so send them to the real booking record
  // instead of showing a stale payment form.
  useEffect(() => {
    if (booking && booking.status !== "accepted") {
      router.replace(`/parent/bookings/${id}`);
    }
  }, [booking, id, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (!booking || booking.status !== "accepted") {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
        <div className="h-24 w-full animate-pulse rounded-[18px] bg-hairline/40" />
        <div className="h-48 w-full animate-pulse rounded-[18px] bg-hairline/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <h1 className="text-[20px] font-bold font-heading text-ink">Complete Payment</h1>

      {caregiver && (
        <Sheet className="flex items-center gap-3">
          <Avatar
            photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
            name={caregiver.full_name}
            size="sm"
          />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-semibold text-ink">{caregiver.full_name}</span>
            <span className="text-ink-muted">{formatDateLong(booking.starts_at)}</span>
            <span className="text-ink-muted">
              {formatTimeRange(booking.starts_at, booking.ends_at)}
            </span>
          </div>
        </Sheet>
      )}

      <div className="flex flex-col gap-1.5 rounded-[14px] border border-hairline p-4 text-[13px]">
        <div className="flex justify-between">
          <span className="text-ink-muted">Duration</span>
          <span className="font-semibold">
            {(booking.duration_days ?? 1) > 1
              ? `${booking.duration_hours} hrs/day · ${booking.duration_days} days`
              : `${booking.duration_hours} hours`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Rate</span>
          <span className="font-semibold">GH₵{booking.hourly_rate}/hour</span>
        </div>
        <div className="flex justify-between border-t border-hairline pt-1.5">
          <span className="text-ink-muted">Total</span>
          <span className="text-[16px] font-bold tabular-nums text-ink">
            GH₵{booking.total_amount}
          </span>
        </div>
      </div>

      <PaymentForm
        bookingId={id}
        amount={booking.total_amount}
        onPaid={() => {
          // A beat to actually see PaymentForm's own "booked
          // successfully" confirmation before moving on to the fuller
          // booking page (which adds the real "Message {name}" action).
          setTimeout(() => router.replace(`/parent/bookings/${id}`), 1500);
        }}
      />
    </div>
  );
}
