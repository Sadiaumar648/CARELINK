"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Prohibit, ShieldCheck, Star } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty-state";
import { MessageThread } from "@/components/message-thread";
import { ReportForm } from "@/components/report-form";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  address: string;
  one_off_notes: string | null;
  hourly_rate: number;
  total_amount: number;
  status: string;
  decline_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
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

type CaregiverBrief = {
  full_name: string;
  photo_path: string | null;
  verification_status: string;
  rating_avg: number | null;
  rating_count: number;
  areas: { area: string; isPrimary: boolean }[];
};

type BookingEvent = {
  from_status: string | null;
  to_status: string;
  note: string | null;
  occurred_at: string;
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

// The backend's real booking_status enum (bookings.sql). UI copy only —
// the value stored and sent to the API is always the real one.
const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting caregiver response",
  accepted: "Booking accepted",
  declined: "Booking unavailable",
  expired: "Request expired",
  paid: "Paid — awaiting session",
  active: "Session in progress",
  completed: "Completed",
  cancelled: "Booking cancelled",
  disputed: "Under review",
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BookingDetail({ id, viewerRole }: { id: string; viewerRole: "parent" | "staff" }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [ward, setWard] = useState<Ward>(null);
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>(null);
  const [counterpartyUserId, setCounterpartyUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [caregiver, setCaregiver] = useState<CaregiverBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<{
      booking: Booking;
      ward: Ward;
      events: BookingEvent[];
      emergencyContact: EmergencyContact;
      counterpartyUserId: string | null;
    }>(`/api/bookings/${id}`)
      .then((res) => {
        setError(null);
        setBooking(res.booking);
        setWard(res.ward);
        setEvents(res.events);
        setEmergencyContact(res.emergencyContact);
        setCounterpartyUserId(res.counterpartyUserId);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [id]);

  const staffProfileId = booking?.staff_profile_id;
  useEffect(() => {
    if (viewerRole !== "parent" || !staffProfileId) return;
    apiFetch<{ caregiver: CaregiverBrief }>(`/api/caregivers/${staffProfileId}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch(() => undefined);
  }, [viewerRole, staffProfileId]);

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

  if (error && !booking) return <ErrorState onRetry={load} />;
  if (!booking) return <p className="p-6 text-[13px] text-ink-muted">Loading…</p>;

  const canCancel = ["pending", "accepted", "paid"].includes(booking.status);
  const isToday = new Date().toISOString().slice(0, 10) === booking.starts_at.slice(0, 10);
  const primaryArea =
    caregiver?.areas?.find((a) => a.isPrimary)?.area ?? caregiver?.areas?.[0]?.area;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold font-heading">
            {formatRange(booking.starts_at, booking.ends_at)}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {booking.reference} · Requested {formatDateTime(booking.created_at)}
          </p>
        </div>
        <StatusBadge
          label={STATUS_LABEL[booking.status] ?? booking.status}
          tone={TONE[booking.status] ?? "neutral"}
        />
      </div>

      {viewerRole === "parent" && caregiver && (
        <Sheet className="flex items-center gap-4">
          <Avatar
            photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
            name={caregiver.full_name}
            size="md"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-semibold">{caregiver.full_name}</p>
              {caregiver.verification_status === "verified" && <VerificationBadge />}
            </div>
            <p className="flex items-center gap-1 text-[13px] text-ink-muted">
              <Star size={14} weight="fill" className="text-gold" />
              {caregiver.rating_avg ? caregiver.rating_avg.toFixed(1) : "New"}
              {caregiver.rating_count > 0 && ` · ${caregiver.rating_count} reviews`}
              {primaryArea ? ` · ${primaryArea}` : ""}
            </p>
          </div>
        </Sheet>
      )}

      {booking.status === "accepted" && viewerRole === "parent" && (
        <Sheet className="flex flex-col items-center gap-2 bg-sage-tint text-center">
          <CheckCircle size={28} weight="fill" className="text-sage-pressed" />
          <p className="text-[16px] font-semibold text-sage-pressed">Booking accepted</p>
          <p className="text-[13px] text-sage-pressed">
            {caregiver?.full_name ?? "The caregiver"} has accepted your booking request.
          </p>
        </Sheet>
      )}

      {booking.status === "pending" && (
        <p className="text-[13px] text-ink-muted">
          The caregiver has received your request. Your booking is not confirmed yet.
        </p>
      )}

      {booking.status === "declined" && (
        <Sheet className="flex flex-col items-center gap-3 text-center">
          <Prohibit size={28} className="text-error" />
          <p className="text-[16px] font-semibold">Booking unavailable</p>
          <p className="text-[13px] text-ink-muted">
            {caregiver?.full_name ?? "This caregiver"} isn&apos;t available for this request.
          </p>
          {viewerRole === "parent" && (
            <Link href="/parent/find-care">
              <Button>Find Another Caregiver →</Button>
            </Link>
          )}
        </Sheet>
      )}

      <Sheet className="flex flex-col gap-3">
        <p className="text-[15px]">{booking.address}</p>
        {booking.one_off_notes && (
          <p className="text-[13px] text-ink-muted">{booking.one_off_notes}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-hairline pt-3 text-[13px] text-ink-muted">
          <span>Duration: {booking.duration_hours} hrs</span>
          <span>Rate: GH₵{booking.hourly_rate}/hr</span>
          <span className="text-[19px] font-semibold tabular-nums text-ink">
            GH₵{booking.total_amount}
          </span>
        </div>
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

      {events.length > 0 && (
        <Sheet className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Booking history
          </h2>
          <ul className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-ink">{STATUS_LABEL[e.to_status] ?? e.to_status}</span>
                <span>{formatDateTime(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {!["pending", "declined"].includes(booking.status) && <MessageThread bookingId={id} />}

      {error && <p className="text-[13px] text-error">{error}</p>}

      <div className="flex flex-col gap-3">
        {viewerRole === "staff" && booking.status === "pending" && (
          <div className="flex gap-3">
            <Button size="lg" disabled={busy} onClick={() => void act("/accept")}>
              Accept
            </Button>
            <Button
              size="lg"
              variant="danger"
              disabled={busy}
              onClick={() => void act("/decline", {})}
            >
              Decline
            </Button>
          </div>
        )}

        {viewerRole === "parent" && booking.status === "accepted" && (
          <PaymentForm bookingId={id} onPaid={load} />
        )}

        {booking.status === "paid" && (
          <Button
            size={viewerRole === "staff" ? "lg" : "default"}
            disabled={busy || !isToday}
            onClick={() => void act("/start")}
          >
            {isToday ? "Start session" : "Starts on the booking date"}
          </Button>
        )}

        {booking.status === "active" && (
          <Button
            size={viewerRole === "staff" ? "lg" : "default"}
            disabled={busy}
            onClick={() => void act("/end")}
          >
            End session
          </Button>
        )}

        {viewerRole === "parent" && booking.status === "completed" && <ReviewForm bookingId={id} />}

        {viewerRole === "parent" && canCancel && <CancelForm bookingId={id} onCancelled={load} />}
      </div>

      {!["pending", "declined"].includes(booking.status) && counterpartyUserId && (
        <Sheet className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            <ShieldCheck size={16} className="text-sage" />
            CareLink Safety
          </h2>
          <p className="text-[13px] text-ink-muted">
            Keep communication and booking information within CareLink whenever possible.
          </p>
          <ReportForm bookingId={id} subjectUserId={counterpartyUserId} />
        </Sheet>
      )}
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
      <h2 className="text-[17px] font-semibold font-heading">Continue to Payment</h2>
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
      {error && <p className="text-[13px] text-error">{error}</p>}
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
        Cancel Booking
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold">Cancel this booking?</h2>
      <p className="text-[13px] text-ink-muted">Are you sure you want to cancel this booking?</p>
      <Field
        label="Reason for cancelling"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Keep Booking
        </Button>
        <Button type="submit" variant="danger" disabled={submitting}>
          {submitting ? "Cancelling…" : "Cancel Booking"}
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
                ? "border-sage bg-sage/10 text-sage-pressed"
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
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </Sheet>
  );
}
