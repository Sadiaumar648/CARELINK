"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";

type Booking = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
};

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

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  pending: "neutral",
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

export default function AdminBookingsPage() {
  const [status, setStatus] = useState("");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = status ? `?status=${status}` : "";
    apiFetch<{ bookings: Booking[] }>(`/api/admin/bookings${query}`)
      .then((res) => {
        if (!cancelled) setBookings(res.bookings);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
      setBookings(null);
    };
  }, [status]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold">Bookings</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[13px] text-ink"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      {bookings === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {bookings?.length === 0 && <p className="text-[15px] text-ink-muted">No bookings found.</p>}

      <div className="flex flex-col gap-4">
        {bookings?.map((b) => (
          <Sheet key={b.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[17px] font-semibold">{formatRange(b.starts_at, b.ends_at)}</p>
              <p className="text-[13px] text-ink-muted">{b.reference}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[15px] font-semibold tabular-nums">GH₵{b.total_amount}</p>
              <StatusBadge label={b.status} tone={TONE[b.status] ?? "neutral"} />
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}
