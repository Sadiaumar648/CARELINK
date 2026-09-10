"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCountdown } from "@/lib/use-countdown";

export type StaffRequestBooking = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  address: string | null;
  careLocationGeneral?: string | null;
  one_off_notes: string | null;
  status: string;
  // Only set on a request offered through CareLink's caregiver dispatch
  // (care_request_id non-null) — null for every direct request, which
  // shows no countdown at all, unchanged from before.
  offer_expires_at?: string | null;
};

export function formatRequestRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)}–${time(end)}`;
}

// The one real Accept/Decline mechanism for a pending request — shared
// by the dedicated /staff/requests list and the "new request" alert on
// the caregiver's Home page, so a caregiver can respond from either
// place with identical behaviour. Every line of the accept/decline
// logic is preserved from the original /staff/requests implementation.
export function RequestCard({
  booking,
  onRespond,
}: {
  booking: StaffRequestBooking;
  onRespond: () => void;
}) {
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const countdown = useCountdown(booking.offer_expires_at);

  async function accept() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${booking.id}/accept`, { method: "PATCH" });
      onRespond();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function decline() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${booking.id}/decline`, {
        method: "PATCH",
        body: declineReason.trim() ? { reason: declineReason.trim() } : {},
      });
      onRespond();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/staff/schedule/${booking.id}`}
            className="text-[17px] font-semibold font-heading hover:text-wisteria"
          >
            {formatRequestRange(booking.starts_at, booking.ends_at)}
          </Link>
          <p className="text-[14px] text-ink-muted">
            {booking.address ??
              `${booking.careLocationGeneral ?? "General area not available"} (exact address shown once accepted)`}
          </p>
        </div>
        <p className="text-[19px] font-semibold tabular-nums">GH₵{booking.total_amount}</p>
      </div>
      {booking.one_off_notes && (
        <p className="text-[13px] text-ink-muted">{booking.one_off_notes}</p>
      )}
      {countdown && (
        <p className="text-[12.5px] font-semibold text-[var(--color-warning)]">
          Respond within {countdown} or this request moves to the next caregiver
        </p>
      )}

      {confirming === null && (
        <div className="flex gap-3">
          <Button size="lg" onClick={() => setConfirming("accept")}>
            Accept
          </Button>
          <Button size="lg" variant="danger" onClick={() => setConfirming("decline")}>
            Decline
          </Button>
          <Link href={`/staff/schedule/${booking.id}`} className="ml-auto self-center">
            <span className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover">
              View Request
            </span>
          </Link>
        </div>
      )}

      {confirming === "accept" && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-hairline bg-paper p-4">
          <p className="text-[14px] font-semibold text-ink">Accept this care request?</p>
          <p className="text-[13px] text-ink-muted">
            You&apos;re agreeing to provide care at the date and time shown above.
          </p>
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex gap-3">
            <Button size="lg" disabled={submitting} onClick={() => void accept()}>
              {submitting ? "Accepting…" : "Accept Request"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={submitting}
              onClick={() => setConfirming(null)}
            >
              Never mind
            </Button>
          </div>
        </div>
      )}

      {confirming === "decline" && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-hairline bg-paper p-4">
          <p className="text-[14px] font-semibold text-ink">Decline this request?</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Let the family know why (optional)
            </span>
            <textarea
              rows={2}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
              placeholder="e.g. Not available that day"
            />
          </label>
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex gap-3">
            <Button size="lg" variant="danger" disabled={submitting} onClick={() => void decline()}>
              {submitting ? "Declining…" : "Decline Request"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={submitting}
              onClick={() => setConfirming(null)}
            >
              Never mind
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
