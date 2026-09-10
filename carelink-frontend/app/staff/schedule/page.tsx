"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarBlank } from "@phosphor-icons/react";
import { CARELINK_HOURLY_RATES } from "@carelink/shared";
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
  duration_hours: number;
  hourly_rate: number;
  total_amount: number;
  address: string | null;
  status: string;
};

type WardBrief = { display_name: string };
type EnrichedBooking = Booking & { wards: WardBrief[] };

function careForLabel(wards: WardBrief[], fallback: string): string {
  if (wards.length === 0) return fallback;
  if (wards.length === 1) return `Care for ${wards[0].display_name}`;
  return `Care for ${wards[0].display_name} & ${wards.length - 1} more`;
}
type EarningsEntry = { bookingId: string; payoutAmount: number | null };

// Unchanged from before this redesign — the same status set and copy
// the schedule page has always used. StatusBadge's own CSS already
// renders these uppercase ("CONFIRMED · PAID", "COMPLETED"), so no
// separate all-caps copy is needed here.
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Presentation-only: the general locality portion of the real address
// CareLink already returns for this booking — never a separate
// "general area" field, since none exists once a caregiver has
// accepted (they're meant to have the real address at that point — see
// app/api/bookings/[id]/route.ts's staffCanSeeExactAddress). This just
// avoids putting the full street-level address on the list view; the
// existing detail page is untouched and still shows it in full.
function generalArea(address: string | null): string {
  if (!address) return "Area not available";
  const parts = address.split(",").map((p) => p.trim());
  return parts.length > 1 ? parts.slice(1).join(", ") : address;
}

// Derived from the booking's own real hourly_rate against CareLink's
// fixed rates (@carelink/shared) — never a new field, never guessed.
// A booking priced before the fixed-rate model (or otherwise not an
// exact match) simply shows no care-type label rather than a wrong one.
function caregiverTypeLabel(hourlyRate: number): string | null {
  if (hourlyRate === CARELINK_HOURLY_RATES.nanny) return "Nanny";
  if (hourlyRate === CARELINK_HOURLY_RATES.babysitter) return "Babysitter";
  return null;
}

function BookingCard({
  booking,
  payoutAmount,
}: {
  booking: EnrichedBooking;
  payoutAmount?: number | null;
}) {
  const caregiverType = caregiverTypeLabel(booking.hourly_rate);
  // A completed session's real, settled payout once one exists; the
  // confirmed booking price for a session still upcoming, since nothing
  // has been paid out yet. Never recalculated from current pricing.
  const earnings = payoutAmount ?? booking.total_amount;

  return (
    <Link href={`/staff/schedule/${booking.id}`}>
      <Sheet className="flex flex-col gap-3 hover:border-wisteria/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[16px] font-semibold text-ink">{formatDate(booking.starts_at)}</p>
            <p className="text-[13.5px] text-ink-muted">
              {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)} ·{" "}
              {booking.duration_hours} {booking.duration_hours === 1 ? "hr" : "hrs"}
            </p>
          </div>
          <StatusBadge
            label={STATUS_LABEL[booking.status] ?? booking.status}
            tone={TONE[booking.status] ?? "neutral"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
          {caregiverType && <span className="font-semibold text-ink">{caregiverType}</span>}
          {caregiverType && <span aria-hidden>·</span>}
          <span>{careForLabel(booking.wards, booking.reference)}</span>
        </div>

        <p className="text-[13px] text-ink-muted">{generalArea(booking.address)}</p>

        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <span className="text-[12px] text-ink-muted">{booking.reference}</span>
          <span className="text-[17px] font-semibold tabular-nums text-ink">GH₵{earnings}</span>
        </div>

        <span className="self-start text-[12.5px] font-semibold text-wisteria">View Details</span>
      </Sheet>
    </Link>
  );
}

// Schedule is linked from more than one place (Home's own stat card,
// and Safety & Privacy's "Review a Parent" section) — the back link
// used to always point to Home regardless, so arriving from Safety &
// Privacy stranded you a page further from where you actually were.
// The linker now says where it came from via ?from=, and this page
// just reads it back; no other behavior changes for a plain /staff/
// schedule visit (from defaults to Home, same as before).
const BACK_DESTINATIONS: Record<string, { href: string; label: string }> = {
  safety: { href: "/staff/safety", label: "Back to Safety & Privacy" },
};

export default function StaffSchedulePage() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const back = (from && BACK_DESTINATIONS[from]) || { href: "/staff", label: "Back to Home" };

  const [bookings, setBookings] = useState<EnrichedBooking[] | null>(null);
  const [payouts, setPayouts] = useState<Map<string, number | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    Promise.all([
      apiFetch<{ bookings: Booking[] }>("/api/bookings"),
      apiFetch<{ earnings: EarningsEntry[] }>("/api/staff/earnings").catch(() => ({
        earnings: [] as EarningsEntry[],
      })),
    ])
      .then(async ([bookingsRes, earningsRes]) => {
        const relevant = bookingsRes.bookings.filter((b) =>
          ["accepted", "paid", "active", "completed"].includes(b.status),
        );
        // Ward name isn't on the bookings row itself (ward_id is a
        // foreign key) — the same real, already-existing single-booking
        // route the booking-detail page already uses for this, which
        // (unlike /api/wards/[id]) is actually authorized for a staff
        // caller.
        const enriched = await Promise.all(
          relevant.map(async (b) => ({
            ...b,
            wards: b.ward_id
              ? await apiFetch<{ wards: WardBrief[] | null; ward: WardBrief | null }>(
                  `/api/bookings/${b.id}`,
                )
                  .then((r) => r.wards ?? (r.ward ? [r.ward] : []))
                  .catch(() => [] as WardBrief[])
              : [],
          })),
        );
        setBookings(enriched);
        setPayouts(new Map(earningsRes.earnings.map((e) => [e.bookingId, e.payoutAmount])));
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  const upcoming = bookings?.filter((b) => ["accepted", "paid", "active"].includes(b.status)) ?? [];
  const past = bookings?.filter((b) => b.status === "completed") ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <Link
        href={back.href}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> {back.label}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">Schedule</h1>
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
            <div className="flex flex-col gap-1">
              <h2 className="text-[18px] font-semibold font-heading text-ink">Upcoming</h2>
              <p className="text-[13px] text-ink-muted">Your confirmed care sessions.</p>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarBlank}
                title="No upcoming care sessions"
                description="When you accept a care request, your confirmed sessions will appear here."
                action={
                  <Link
                    href="/staff/requests"
                    className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                  >
                    Go to Care Requests
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[18px] font-semibold font-heading text-ink">Past</h2>
              <p className="text-[13px] text-ink-muted">Your completed care sessions.</p>
            </div>
            {past.length === 0 ? (
              <EmptyState
                icon={CalendarBlank}
                title="No completed care sessions yet"
                description="Completed sessions will appear here after your care is finished."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {past.map((b) => (
                  <BookingCard key={b.id} booking={b} payoutAmount={payouts.get(b.id) ?? null} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
