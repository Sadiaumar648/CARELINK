"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";

type Booking = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  address: string;
  status: string;
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

export default function StaffRequestsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ bookings: Booking[] }>("/api/bookings?status=pending");
      setBookings(res.bookings);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Not `void load()`: the linter (correctly) flags a same-component
  // function known to setState being invoked directly from an effect
  // body, since that shape is easy to accidentally re-trigger. Calling
  // the fetch inline keeps the initial load and the post-action reload
  // (`respond`, a user-triggered handler, not an effect) doing the same
  // thing without tripping that rule.
  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings?status=pending")
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function respond(id: string, action: "accept" | "decline") {
    setActingOn(id);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${id}/${action}`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Requests</h1>
      {error && <p className="text-[13px] text-magenta">{error}</p>}

      {bookings === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {bookings?.length === 0 && (
        <p className="text-[15px] text-ink-muted">No pending requests right now.</p>
      )}

      <div className="flex flex-col gap-4">
        {bookings?.map((b) => (
          <Sheet key={b.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-semibold">{formatRange(b.starts_at, b.ends_at)}</p>
              <StatusBadge label={b.status} />
            </div>
            <p className="text-[15px] text-ink-muted">{b.address}</p>
            <p className="text-[19px] font-semibold tabular-nums">GH₵{b.total_amount}</p>
            <div className="flex gap-3">
              <Button onClick={() => void respond(b.id, "accept")} disabled={actingOn === b.id}>
                Accept
              </Button>
              <Button
                variant="danger"
                onClick={() => void respond(b.id, "decline")}
                disabled={actingOn === b.id}
              >
                Decline
              </Button>
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}
