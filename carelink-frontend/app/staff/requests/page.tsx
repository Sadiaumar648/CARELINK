"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Tray } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { RequestCard, type StaffRequestBooking } from "@/components/staff/request-card";

export default function StaffRequestsPage() {
  const [bookings, setBookings] = useState<StaffRequestBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: StaffRequestBooking[] }>("/api/bookings?status=pending")
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/staff"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold font-heading text-ink">Care Requests</h1>
        <p className="text-[14px] text-ink-muted">
          Families who&apos;d like to book you are shown here.
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && bookings === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && bookings?.length === 0 && (
        <EmptyState
          icon={Tray}
          title="No new care requests"
          description="When families request your services, they'll appear here."
        />
      )}

      {!error && bookings && bookings.length > 0 && (
        <div className="flex flex-col gap-4">
          {bookings.map((b) => (
            <RequestCard key={b.id} booking={b} onRespond={() => setRetryKey((k) => k + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
