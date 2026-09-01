"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, CaretDown } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { CaregiverLocationView } from "@/components/caregiver-location-view";

type Booking = {
  id: string;
  reference: string;
  address: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
};

// Admin's own read of a booking's detail — reuses the existing
// GET /api/bookings/[id] and [id]/location routes rather than a new
// admin-only endpoint (both already permit the admin role via RLS: the
// location table's read policy explicitly includes
// current_user_role() = 'admin', gated to status = 'active' — no
// permanent tracking, no admin write path). Kept as an inline expand
// on the existing list rather than a new /admin/bookings/[id] route,
// since nothing else here needs a dedicated page yet.
function BookingDetailPanel({ booking }: { booking: Booking }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-3">
      <p className="text-[13px] text-ink-muted">{booking.address}</p>
      {booking.status === "active" ? (
        <CaregiverLocationView bookingId={booking.id} active />
      ) : (
        <p className="text-[12.5px] text-ink-muted">
          Caregiver location is only shown for a currently active booking.
        </p>
      )}
    </div>
  );
}

const STATUSES = [
  "",
  "pending",
  "accepted",
  "paid",
  "active",
  "completed",
  "declined",
  "cancelled",
];

const TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  pending: "info",
  accepted: "neutral",
  paid: "positive",
  active: "positive",
  completed: "positive",
  declined: "attention",
  cancelled: "attention",
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

function AdminBookingsPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    apiFetch<{ bookings: Booking[] }>(`/api/admin/bookings?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setBookings(res.bookings);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [status, from, to, retryKey]);

  function updateFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setBookings(null);
    setError(null);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Bookings</h1>
        <p className="text-[14px] text-ink-muted">Every booking on the platform.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => updateFilter(setStatus, e.target.value)}
          className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] text-ink"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => updateFilter(setFrom, e.target.value)}
            className="rounded-[10px] border border-hairline bg-sheet px-2 py-1.5 text-[13px] text-ink"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => updateFilter(setTo, e.target.value)}
            className="rounded-[10px] border border-hairline bg-sheet px-2 py-1.5 text-[13px] text-ink"
          />
        </label>
        {(status || from || to) && (
          <button
            type="button"
            onClick={() => {
              setStatus("");
              setFrom("");
              setTo("");
              setBookings(null);
              setError(null);
            }}
            className="text-[12.5px] font-semibold text-ink-muted hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <ErrorState
          onRetry={() => {
            setError(null);
            setRetryKey((k) => k + 1);
          }}
        />
      )}

      {!error && bookings === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && bookings?.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title="No bookings found"
          description="Try a different filter."
        />
      )}

      <div className="flex flex-col gap-4">
        {bookings?.map((b) => {
          const open = openId === b.id;
          return (
            <Sheet key={b.id} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : b.id)}
                aria-expanded={open}
                className="flex items-center justify-between gap-4 text-left"
              >
                <div>
                  <p className="text-[17px] font-semibold">{formatRange(b.starts_at, b.ends_at)}</p>
                  <p className="text-[13px] text-ink-muted">{b.reference}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[15px] font-semibold tabular-nums">GH₵{b.total_amount}</p>
                  <StatusBadge label={b.status} tone={TONE[b.status] ?? "neutral"} />
                  <CaretDown
                    size={16}
                    className={`text-ink-muted ${open ? "rotate-180 transition-transform" : "transition-transform"}`}
                  />
                </div>
              </button>
              {open && <BookingDetailPanel booking={b} />}
            </Sheet>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminBookingsPageWrapper() {
  return (
    <Suspense>
      <AdminBookingsPage />
    </Suspense>
  );
}
