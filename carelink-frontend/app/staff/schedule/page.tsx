"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

type Booking = {
  id: string;
  reference: string;
  ward_id: string | null;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
};

type WardBrief = { display_name: string };
type EnrichedBooking = Booking & { ward: WardBrief | null };

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  accepted: "neutral",
  paid: "positive",
  active: "positive",
  completed: "positive",
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "Confirmed",
  paid: "Confirmed · Paid",
  active: "Care in progress",
  completed: "Completed",
};

function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)}–${time(end)}`;
}

function BookingRow({ booking }: { booking: EnrichedBooking }) {
  return (
    <Link href={`/staff/schedule/${booking.id}`}>
      <Sheet className="flex items-center justify-between gap-4 hover:border-sage/50">
        <div>
          <p className="text-[16px] font-semibold text-ink">
            {formatRange(booking.starts_at, booking.ends_at)}
          </p>
          <p className="text-[13px] text-ink-muted">
            {booking.ward ? `Care for ${booking.ward.display_name}` : booking.reference}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[15px] font-semibold tabular-nums">GH₵{booking.total_amount}</p>
          <StatusBadge
            label={STATUS_LABEL[booking.status] ?? booking.status}
            tone={TONE[booking.status] ?? "neutral"}
          />
        </div>
      </Sheet>
    </Link>
  );
}

export default function StaffSchedulePage() {
  const [bookings, setBookings] = useState<EnrichedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then(async (res) => {
        const relevant = res.bookings.filter((b) =>
          ["accepted", "paid", "active", "completed"].includes(b.status),
        );
        const enriched = await Promise.all(
          relevant.map(async (b) => ({
            ...b,
            ward: b.ward_id
              ? await apiFetch<{ ward: WardBrief }>(`/api/wards/${b.ward_id}`)
                  .then((r) => r.ward)
                  .catch(() => null)
              : null,
          })),
        );
        setBookings(enriched);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  const upcoming = bookings?.filter((b) => ["accepted", "paid", "active"].includes(b.status)) ?? [];
  const past = bookings?.filter((b) => b.status === "completed") ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Schedule</h1>
        <p className="text-[14px] text-ink-muted">Your confirmed and past care sessions.</p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && bookings === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && bookings && (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold text-ink">Upcoming Care</h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarBlank}
                title="No upcoming care"
                description="Bookings you've confirmed will appear here."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold text-ink">Past Care</h2>
            {past.length === 0 ? (
              <EmptyState icon={CalendarBlank} title="No completed care yet" />
            ) : (
              <div className="flex flex-col gap-3">
                {past.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
