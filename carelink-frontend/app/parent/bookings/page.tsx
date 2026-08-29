"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, MagnifyingGlass } from "@phosphor-icons/react";
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
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
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

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  pending: "neutral",
  accepted: "neutral",
  paid: "positive",
  active: "positive",
  completed: "positive",
  declined: "attention",
  cancelled: "attention",
  expired: "attention",
  disputed: "attention",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting caregiver response",
  accepted: "Booking confirmed",
  declined: "Booking unavailable",
  expired: "Request expired",
  paid: "Confirmed · Paid",
  active: "Care in progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Under review",
};

type TabKey = "all" | "pending" | "upcoming" | "active" | "completed" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function matchesTab(status: string, tab: TabKey): boolean {
  switch (tab) {
    case "pending":
      return status === "pending";
    case "upcoming":
      return status === "accepted" || status === "paid";
    case "active":
      return status === "active";
    case "completed":
      return status === "completed";
    case "cancelled":
      return status === "cancelled" || status === "declined" || status === "expired";
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
  pending: {
    title: "No pending requests",
    description: "Booking requests awaiting a caregiver's response will appear here.",
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
  cancelled: {
    title: "No cancelled bookings",
    description: "Bookings that were cancelled, declined, or expired will appear here.",
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
                    ? "bg-sage text-sheet"
                    : "bg-sheet text-ink-muted hover:text-ink border border-hairline"
                }`}
              >
                {t.label}
                {counts && counts[t.key] > 0 ? ` (${counts[t.key]})` : ""}
              </button>
            ))}
          </div>

          {bookings && bookings.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by caregiver or reference"
                  aria-label="Search bookings"
                  className="w-full rounded-[10px] border border-hairline bg-sheet py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none focus:ring-4 focus:ring-sage/15"
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
                  <div className="flex flex-col gap-3 rounded-[18px] border border-hairline bg-sheet p-5 hover:border-sage/50">
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
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusBadge
                        label={STATUS_LABEL[b.status] ?? b.status}
                        tone={TONE[b.status] ?? "neutral"}
                      />
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
