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
  status: string;
};

const MESSAGEABLE = ["accepted", "paid", "active", "completed"];

export default function StaffMessagesPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => setBookings(res.bookings.filter((b) => MESSAGEABLE.includes(b.status))))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Messages</h1>
      {error && <p className="text-[13px] text-error">{error}</p>}
      {bookings === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {bookings?.length === 0 && (
        <p className="text-[15px] text-ink-muted">Messaging opens once you accept a booking.</p>
      )}
      <div className="flex flex-col gap-4">
        {bookings?.map((b) => (
          <Link key={b.id} href={`/staff/schedule/${b.id}`}>
            <Sheet className="flex items-center justify-between gap-4 hover:outline hover:outline-2 hover:outline-sage">
              <p className="text-[15px] font-semibold">{b.reference}</p>
              <StatusBadge label={b.status} />
            </Sheet>
          </Link>
        ))}
      </div>
    </div>
  );
}
