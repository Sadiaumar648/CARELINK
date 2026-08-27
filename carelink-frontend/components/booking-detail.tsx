"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { MessageThread } from "@/components/message-thread";

type Booking = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  address: string;
  one_off_notes: string | null;
  total_amount: number;
  status: string;
  decline_reason: string | null;
  cancel_reason: string | null;
};

type Ward = {
  display_name: string;
  age_years: number;
  allergies: string | null;
  medications: string | null;
  special_needs: string | null;
  routine_notes: string | null;
} | null;

type EmergencyContact = { name: string; phone: string } | null;

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
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)}–${time(end)}`;
}

export function BookingDetail({ id, viewerRole }: { id: string; viewerRole: "parent" | "staff" }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [ward, setWard] = useState<Ward>(null);
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<{ booking: Booking; ward: Ward; emergencyContact: EmergencyContact }>(
      `/api/bookings/${id}`,
    )
      .then((res) => {
        setBooking(res.booking);
        setWard(res.ward);
        setEmergencyContact(res.emergencyContact);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [id]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${id}${path}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !booking) return <p className="p-6 text-[13px] text-magenta">{error}</p>;
  if (!booking) return <p className="p-6 text-[13px] text-ink-muted">Loading…</p>;

  const canCancel = ["pending", "accepted", "paid"].includes(booking.status);
  const isToday = new Date().toISOString().slice(0, 10) === booking.starts_at.slice(0, 10);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold">
            {formatRange(booking.starts_at, booking.ends_at)}
          </h1>
          <p className="text-[13px] text-ink-muted">{booking.reference}</p>
        </div>
        <StatusBadge label={booking.status} tone={TONE[booking.status] ?? "neutral"} />
      </div>

      <Sheet className="flex flex-col gap-3">
        <p className="text-[15px]">{booking.address}</p>
        {booking.one_off_notes && (
          <p className="text-[13px] text-ink-muted">{booking.one_off_notes}</p>
        )}
        <p className="text-[19px] font-semibold tabular-nums">GH₵{booking.total_amount}</p>
      </Sheet>

      {ward && (
        <Sheet className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Care profile
          </h2>
          <p className="text-[15px] font-semibold">
            {ward.display_name} · {ward.age_years}
          </p>
          {ward.allergies && (
            <p className="text-[13px] text-ink-muted">Allergies: {ward.allergies}</p>
          )}
          {ward.medications && (
            <p className="text-[13px] text-ink-muted">Medications: {ward.medications}</p>
          )}
          {ward.special_needs && (
            <p className="text-[13px] text-ink-muted">Special needs: {ward.special_needs}</p>
          )}
          {ward.routine_notes && (
            <p className="text-[13px] text-ink-muted">Routine: {ward.routine_notes}</p>
          )}
        </Sheet>
      )}

      {emergencyContact && (
        <Sheet className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Emergency contact
          </h2>
          <p className="text-[15px]">
            {emergencyContact.name} · {emergencyContact.phone}
          </p>
        </Sheet>
      )}

      {(booking.decline_reason || booking.cancel_reason) && (
        <p className="text-[13px] text-ink-muted">
          Reason: {booking.decline_reason ?? booking.cancel_reason}
        </p>
      )}

      {!["pending", "declined"].includes(booking.status) && <MessageThread bookingId={id} />}

      {error && <p className="text-[13px] text-magenta">{error}</p>}

      <div className="flex flex-col gap-3">
        {viewerRole === "staff" && booking.status === "pending" && (
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => void act("/accept")}>
              Accept
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void act("/decline", {})}>
              Decline
            </Button>
          </div>
        )}

        {viewerRole === "parent" && booking.status === "accepted" && (
          <PaymentForm bookingId={id} onPaid={load} />
        )}

        {booking.status === "paid" && (
          <Button disabled={busy || !isToday} onClick={() => void act("/start")}>
            {isToday ? "Start session" : "Starts on the booking date"}
          </Button>
        )}

        {booking.status === "active" && (
          <Button disabled={busy} onClick={() => void act("/end")}>
            End session
          </Button>
        )}

        {viewerRole === "parent" && booking.status === "completed" && <ReviewForm bookingId={id} />}

        {viewerRole === "parent" && canCancel && <CancelForm bookingId={id} onCancelled={load} />}
      </div>
    </div>
  );
}

function PaymentForm({ bookingId, onPaid }: { bookingId: string; onPaid: () => void }) {
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo">("mtn");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ payment: { id: string; status: string } }>(
        `/api/bookings/${bookingId}/payments`,
        { method: "POST", body: { network, payerPhone: phone } },
      );
      setResult(res.payment);
      if (res.payment.status === "succeeded") onPaid();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.status === "succeeded") return null;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">Pay for this booking</h2>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="network"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Mobile money network
        </label>
        <select
          id="network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as typeof network)}
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        >
          <option value="mtn">MTN</option>
          <option value="telecel">Telecel</option>
          <option value="airteltigo">AirtelTigo</option>
        </select>
      </div>
      <Field
        label="Paying phone number"
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {result?.status === "pending" && (
        <p className="text-[13px] text-ink-muted">
          Waiting on confirmation — reload to check again.
        </p>
      )}
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Paying…" : "Pay now"}
      </Button>
    </Sheet>
  );
}

function CancelForm({ bookingId, onCancelled }: { bookingId: string; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/cancel`, { method: "PATCH", body: { reason } });
      onCancelled();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Reason for cancelling"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" variant="danger" disabled={submitting}>
          {submitting ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </Sheet>
  );
}

function ReviewForm({ bookingId }: { bookingId: string }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        body: { rating, comment: comment || undefined },
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <p className="text-[15px] text-ink-muted">Thanks for your review.</p>;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">Leave a review</h2>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`rounded border px-3 py-2 text-[15px] font-semibold ${
              rating === n
                ? "border-cyan bg-cyan/10 text-cyan-pressed"
                : "border-hairline text-ink-muted"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <Field
        label="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </Sheet>
  );
}
