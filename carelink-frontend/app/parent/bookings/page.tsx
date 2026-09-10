"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, MagnifyingGlass } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VerificationBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  ward_id: string | null;
  ward_ids: string[] | null;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
  // Set only by a human cancelling (app/api/bookings/[id]/cancel) —
  // never by the payment window's own lazy/cron expiry
  // (lib/services/payment-window.ts), which leaves this null on
  // purpose. That's the real, structural signal used below to show
  // "Payment Expired" instead of a generic "Cancelled" for that one
  // specific case — never a guess from cancel_reason text.
  cancelled_by: string | null;
};

type CaregiverBrief = {
  full_name: string;
  photo_path: string | null;
  verification_status: string;
};

type WardBrief = { display_name: string };

type EnrichedBooking = Booking & {
  caregiver: CaregiverBrief | null;
  ward: WardBrief | null;
};

const TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  pending: "info",
  accepted: "neutral",
  paid: "positive",
  active: "positive",
  completed: "positive",
  declined: "attention",
  cancelled: "attention",
  expired: "attention",
  disputed: "attention",
};

// Parent-facing labels — kept consistent with booking-detail.tsx's own
// STATUS_LABEL for the same real booking_status enum. 'accepted' reads
// as "Awaiting Payment" (the caregiver has committed, but the booking
// isn't Confirmed/Paid until payment succeeds — CareLink's finalized
// payment-after-acceptance workflow, mapped onto the existing status
// names rather than renaming the schema). "Payment Expired" isn't a
// distinct status here either — see statusLabel() below for how a
// 'cancelled' row becomes that specific label.
const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting caregiver response",
  accepted: "Awaiting Payment",
  declined: "Booking unavailable",
  expired: "Request expired",
  paid: "Confirmed/Paid",
  active: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Under review",
};

// The one place a 'cancelled' row's real cause decides its label — a
// human explicitly cancelling (cancelled_by set) always reads
// "Cancelled"; the payment window's own lazy/cron expiry (cancelled_by
// left null on purpose, see lib/services/payment-window.ts) reads
// "Payment Expired" instead. Never a separate tab or status — both
// stay under 'cancelled' in the database and under the All tab here.
function statusLabel(b: Pick<Booking, "status" | "cancelled_by">): string {
  if (b.status === "cancelled" && b.cancelled_by === null) return "Payment Expired";
  return STATUS_LABEL[b.status] ?? b.status;
}

// CareLink's finalized tab structure: no separate Pending or Cancelled
// tab — every status (awaiting caregiver response, awaiting payment,
// cancelled, payment-expired, declined, disputed, and any other
// non-upcoming/active/completed state) is still a real, visible row,
// just only ever under All. Nothing about the underlying booking or
// its data changes because a tab was removed.
type TabKey = "all" | "upcoming" | "active" | "completed";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

function matchesTab(status: string, tab: TabKey): boolean {
  switch (tab) {
    // A 'paid' booking is, by the state machine itself, one that
    // hasn't started yet — the moment it does, staff moves it to
    // 'active' (bookings.sql's own paid -> active transition), which
    // is what the Active tab shows instead. No separate date check
    // needed on top of the status the backend already maintains.
    case "upcoming":
      return status === "paid";
    case "active":
      return status === "active";
    case "completed":
      return status === "completed";
    default:
      return true;
  }
}

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

const EMPTY_TAB_COPY: Record<TabKey, { title: string; description: string }> = {
  all: {
    title: "No bookings yet",
    description: "Your care requests and confirmed bookings will appear here.",
  },
  upcoming: {
    title: "No upcoming bookings",
    description: "You don't have any confirmed upcoming care.",
  },
  active: {
    title: "No care in progress",
    description: "A session that's currently underway will appear here.",
  },
  completed: {
    title: "No completed bookings yet",
    description: "Bookings you've completed with a caregiver will appear here.",
  },
};

export default function ParentBookingsPage() {
  const [bookings, setBookings] = useState<EnrichedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then(async (res) => {
        const enriched = await Promise.all(
          res.bookings.map(async (b) => {
            const [caregiver, ward] = await Promise.all([
              apiFetch<{ caregiver: CaregiverBrief }>(`/api/caregivers/${b.staff_profile_id}`)
                .then((r) => r.caregiver)
                .catch(() => null),
              b.ward_id
                ? apiFetch<{ ward: WardBrief }>(`/api/wards/${b.ward_id}`)
                    .then((r) => r.ward)
                    .catch(() => null)
                : Promise.resolve(null),
            ]);
            return { ...b, caregiver, ward };
          }),
        );
        enriched.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
        setBookings(enriched);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  const filtered = useMemo(() => {
    if (!bookings) return null;
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (!matchesTab(b.status, tab)) return false;
      if (!q) return true;
      return (
        b.reference.toLowerCase().includes(q) ||
        (b.caregiver?.full_name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [bookings, tab, query]);

  const counts = useMemo(() => {
    if (!bookings) return null;
    return Object.fromEntries(
      TABS.map((t) => [t.key, bookings.filter((b) => matchesTab(b.status, t.key)).length]),
    ) as Record<TabKey, number>;
  }, [bookings]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">My Bookings</h1>
        <p className="text-[14px] text-ink-muted">
          Keep track of your care requests and upcoming bookings.
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                  tab === t.key
                    ? "bg-wisteria text-sheet"
                    : "bg-sheet text-ink-muted hover:text-ink border border-hairline"
                }`}
              >
                {t.label}
                {counts && counts[t.key] > 0 ? ` (${counts[t.key]})` : ""}
              </button>
            ))}
          </div>

          {bookings && bookings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your bookings"
                    aria-label="Search your bookings"
                    className="w-full rounded-[10px] border border-hairline bg-sheet py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
                  />
                </div>
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-[12.5px] font-semibold text-ink-muted hover:text-ink"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <p className="pl-1 text-[11.5px] text-ink-muted">
                Search by caregiver name or booking reference.
              </p>
            </div>
          )}

          {bookings === null && (
            <div className="flex flex-col gap-3">
              <BookingCardSkeleton />
              <BookingCardSkeleton />
            </div>
          )}

          {filtered && filtered.length === 0 && (
            <EmptyState
              icon={CalendarCheck}
              title={EMPTY_TAB_COPY[tab].title}
              description={EMPTY_TAB_COPY[tab].description}
              action={
                <Link href="/parent/find-care">
                  <Button size="default">Find Care</Button>
                </Link>
              }
            />
          )}

          {filtered && filtered.length > 0 && (
            <div className="flex flex-col gap-4">
              {filtered.map((b) => (
                <Link key={b.id} href={`/parent/bookings/${b.id}`}>
                  <div className="flex flex-col gap-3 rounded-[18px] border border-hairline bg-sheet p-5 hover:border-wisteria/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          photoUrl={caregiverPhotoUrl(b.caregiver?.photo_path)}
                          name={b.caregiver?.full_name ?? "Caregiver"}
                          size="sm"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[15px] font-semibold text-ink">
                              {b.caregiver?.full_name ?? "Caregiver"}
                            </p>
                            {b.caregiver?.verification_status === "verified" && (
                              <VerificationBadge />
                            )}
                          </div>
                          {b.ward && (
                            <p className="text-[12.5px] text-ink-muted">
                              Care for {b.ward.display_name}
                              {b.ward_ids && b.ward_ids.length > 1
                                ? ` & ${b.ward_ids.length - 1} more`
                                : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusBadge label={statusLabel(b)} tone={TONE[b.status] ?? "neutral"} />
                    </div>
                    <div className="flex items-center justify-between border-t border-hairline pt-3">
                      <div>
                        <p className="text-[14px] font-medium text-ink">
                          {formatRange(b.starts_at, b.ends_at)}
                        </p>
                        <p className="text-[12px] text-ink-muted">{b.reference}</p>
                      </div>
                      <p className="text-[15px] font-semibold tabular-nums">GH₵{b.total_amount}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
