"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function ParentBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Bookings</h1>
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      {bookings === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {bookings?.length === 0 && (
        <p className="text-[15px] text-ink-muted">
          No bookings yet —{" "}
          <Link href="/parent" className="font-semibold text-cyan">
            find a caregiver
          </Link>{" "}
          to get started.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {bookings?.map((b) => (
          <Link key={b.id} href={`/parent/bookings/${b.id}`}>
            <Sheet className="flex items-center justify-between gap-4 hover:outline hover:outline-2 hover:outline-cyan">
              <div>
                <p className="text-[17px] font-semibold">{formatRange(b.starts_at, b.ends_at)}</p>
                <p className="text-[13px] text-ink-muted">{b.reference}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[15px] font-semibold tabular-nums">GH₵{b.total_amount}</p>
                <StatusBadge label={b.status} tone={TONE[b.status] ?? "neutral"} />
              </div>
            </Sheet>
          </Link>
        ))}
      </div>
    </div>
  );
}
