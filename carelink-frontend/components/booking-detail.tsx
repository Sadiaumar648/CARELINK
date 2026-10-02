"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  ChatCircleText,
  Prohibit,
  ShieldCheck,
  Star,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportForm } from "@/components/report-form";
import { SafeTrackCaregiverControl } from "@/components/safe-track";
import { CaregiverLocationView } from "@/components/caregiver-location-view";
import { SessionActionButton } from "@/components/staff/session-action-button";
import { WardCareProfileList } from "@/components/ward-care-profile";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  duration_days: number | null;
  address: string | null;
  one_off_notes: string | null;
  hourly_rate: number;
  total_amount: number;
  status: string;
  decline_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
};

type Ward = {
  id?: string;
  display_name: string;
  age_years: number;
  allergies: string | null;
  medications: string | null;
  meal_notes: string | null;
  special_needs: string | null;
  routine_notes: string | null;
  house_rules: string | null;
  general_notes: string | null;
};

type EmergencyContact = { name: string; phone: string } | null;

type CaregiverBrief = {
  full_name: string;
  photo_path: string | null;
  verification_status: string;
  verification_method: "carelink" | "agency" | null;
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

// The backend's real booking_status enum (bookings.sql). UI copy only —
// the value stored and sent to the API is always the real one.
// 'accepted' reads as "Awaiting Payment" — the caregiver has committed,
// but the booking isn't Confirmed/Paid until payment succeeds (task 20's
// conceptual flow, mapped onto the existing status names rather than
// renaming the schema).
const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting caregiver response",
  accepted: "Awaiting Payment",
  declined: "Booking unavailable",
  expired: "Request expired",
  paid: "Confirmed/Paid",
  active: "In Progress",
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

type Stage = { label: string; done: boolean; at: string | null };

// Derived only from real booking_events rows (never assumed) — a stage is
// only ever marked done when an actual logged transition (or the
// booking's own current status, for the still-in-flight case) supports
// it. "Payment & confirmation" is one stage, not two, because this
// system has no distinct "confirmed" transition separate from the
// booking reaching 'paid'.
function bookingStages(booking: Booking, events: BookingEvent[]): Stage[] {
  const eventFor = (status: string) =>
    events.find((e) => e.to_status === status)?.occurred_at ?? null;
  const created = eventFor("pending") ?? booking.created_at;
  const responded = eventFor("accepted") ?? eventFor("declined");
  const paid = eventFor("paid");
  const completed = eventFor("completed");

  return [
    { label: "Booking requested", done: true, at: created },
    {
      label: "Caregiver response",
      done: Boolean(responded) || !["pending"].includes(booking.status),
      at: responded,
    },
    {
      label: "Payment & confirmation",
      done: Boolean(paid) || ["paid", "active", "completed"].includes(booking.status),
      at: paid,
    },
    { label: "Care completed", done: booking.status === "completed", at: completed },
  ];
}

export function BookingDetail({ id, viewerRole }: { id: string; viewerRole: "parent" | "staff" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPaid = searchParams.get("justPaid") === "1";
  const [booking, setBooking] = useState<Booking | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>(null);
  const [counterpartyUserId, setCounterpartyUserId] = useState<string | null>(null);
  const [counterpartyVerificationStatus, setCounterpartyVerificationStatus] = useState<
    string | null
  >(null);
  const [counterpartyVerificationMethod, setCounterpartyVerificationMethod] = useState<
    "carelink" | "agency" | null
  >(null);
  const [careLocationGeneral, setCareLocationGeneral] = useState<string | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [caregiver, setCaregiver] = useState<CaregiverBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  // A parent arriving here from their own home page (?from=home, e.g.
  // the active-session card's "View Details") gets a real way back to
  // Home instead of always landing on "My Bookings" regardless of where
  // they actually came from.
  const [fromHome, setFromHome] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("from") === "home") {
      void Promise.resolve().then(() => setFromHome(true));
    }
  }, []);

  function load() {
    apiFetch<{
      booking: Booking;
      careLocationGeneral: string | null;
      ward: Ward | null;
      wards: Ward[];
      events: BookingEvent[];
      emergencyContact: EmergencyContact;
      counterpartyUserId: string | null;
      counterpartyVerificationStatus: string | null;
      counterpartyVerificationMethod: "carelink" | "agency" | null;
    }>(`/api/bookings/${id}`)
      .then((res) => {
        setError(null);
        setBooking(res.booking);
        setCareLocationGeneral(res.careLocationGeneral);
        setWards(res.wards ?? (res.ward ? [res.ward] : []));
        setEvents(res.events);
        setEmergencyContact(res.emergencyContact);
        setCounterpartyUserId(res.counterpartyUserId);
        setCounterpartyVerificationStatus(res.counterpartyVerificationStatus);
        setCounterpartyVerificationMethod(res.counterpartyVerificationMethod);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [id]);

  // A parent viewing a still-unpaid booking — whatever got them here
  // (the matched screen's View Nanny → Pay & Confirm Booking, or just
  // opening it from My Bookings) — lands on the dedicated payment
  // screen instead, rather than reusing this page's own, heavier
  // booking-detail chrome for what's really just "go pay."
  const bookingStatusForRedirect = booking?.status;
  useEffect(() => {
    if (viewerRole === "parent" && bookingStatusForRedirect === "accepted") {
      router.replace(`/parent/bookings/${id}/pay`);
    }
  }, [viewerRole, bookingStatusForRedirect, id, router]);

  // A link to this page can carry ?focus=care-profile (e.g. "Care for
  // <name>" on the caregiver's Schedule list, or Home's "View Care
  // Profile") to jump straight to the child's details. A URL *hash*
  // doesn't work reliably here: the Care Profile Sheet only exists in
  // the DOM once `wards` has actually loaded (booking starts out null,
  // rendering a skeleton first), so the browser/Next's own one-time,
  // on-navigation anchor scroll has nothing to land on yet — and next/
  // link's own scroll-on-navigate behavior can then win the race and
  // leave the page at the top regardless. A query param sidesteps that
  // entirely: nothing else in Next reacts to it, so this effect is the
  // only thing that ever scrolls the page for it, once the section is
  // actually there. Guarded to fire only once per page visit — bookings
  // in an 'accepted' status keep re-fetching every 5s below, which
  // would otherwise yank the page back here on every poll.
  const scrolledToFocusRef = useRef(false);
  useEffect(() => {
    if (wards.length === 0 || scrolledToFocusRef.current) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("focus") !== "care-profile") return;
    scrolledToFocusRef.current = true;
    document.getElementById("care-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wards]);

  // While a booking is genuinely awaiting payment, or paid and waiting
  // for its scheduled start time, keep re-checking it — the payment
  // window's own server-side expiry (or the parent paying from a
  // different tab/device) only becomes visible through a fresh fetch,
  // same reasoning as the dispatch status page's own poll; a 'paid'
  // booking's own fetch is also what actually advances it to 'active'
  // once its time arrives (lib/services/session-lifecycle.ts runs as a
  // side effect of GET /api/bookings/[id] itself).
  const bookingStatus = booking?.status;
  useEffect(() => {
    if (bookingStatus !== "accepted" && bookingStatus !== "paid") return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() closes over id via props, re-created each render; only bookingStatus should restart the interval
  }, [bookingStatus]);

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

  if (error && !booking) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState onRetry={load} />
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-[18px]" />
        <Skeleton className="h-32 w-full rounded-[18px]" />
      </div>
    );
  }

  // Arriving straight from paying (app/parent/bookings/[id]/pay's
  // onPaid redirect) — just the confirmation, nothing else. The full
  // location/care-profile/timeline/Safety view below is still exactly
  // where it's always been, for whenever this same booking is opened
  // normally from My Bookings.
  if (justPaid && viewerRole === "parent" && booking.status === "paid") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <Sheet className="flex flex-col items-center gap-2 bg-wisteria-tint text-center">
          <CheckCircle size={28} weight="fill" className="text-wisteria-pressed" />
          <p className="text-[16px] font-semibold text-wisteria-pressed">
            Your session has been booked successfully
          </p>
          <p className="text-[13px] text-wisteria-pressed">
            Your care booking with {caregiver?.full_name ?? "your caregiver"} is confirmed.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/parent/messages/${id}`}>
              <Button>Message {caregiver?.full_name ?? "your caregiver"}</Button>
            </Link>
            <Link href="/parent">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
          </div>
        </Sheet>
      </div>
    );
  }

  const canCancel = ["pending", "accepted", "paid"].includes(booking.status);
  // The parent, still at the "complete payment" moment — this screen
  // stays a lean payment summary; the child's care profile, the booking
  // timeline, and Safety/Report all return once the booking is paid.
  const parentAwaitingPayment = viewerRole === "parent" && booking.status === "accepted";
  const primaryArea =
    caregiver?.areas?.find((a) => a.isPrimary)?.area ?? caregiver?.areas?.[0]?.area;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href={viewerRole === "parent" ? (fromHome ? "/parent" : "/parent/bookings") : "/staff"}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} />{" "}
        {viewerRole === "parent" ? (fromHome ? "Home" : "My Bookings") : "Home"}
      </Link>
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
              {caregiver.verification_status === "verified" && (
                <VerificationBadge method={caregiver.verification_method} />
              )}
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

      {booking.status === "paid" && viewerRole === "parent" && (
        <Sheet className="flex flex-col items-center gap-2 bg-wisteria-tint text-center">
          <CheckCircle size={28} weight="fill" className="text-wisteria-pressed" />
          <p className="text-[16px] font-semibold text-wisteria-pressed">
            Your session has been booked successfully
          </p>
          <p className="text-[13px] text-wisteria-pressed">
            Your care booking with {caregiver?.full_name ?? "your caregiver"} is confirmed.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/parent/messages/${id}`}>
              <Button>Message {caregiver?.full_name ?? "your caregiver"}</Button>
            </Link>
            <Link href="/parent">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
          </div>
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
        <div className="flex flex-col gap-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Care location
          </h2>
          {booking.address ? (
            <>
              <p className="text-[15px]">{booking.address}</p>
              {viewerRole === "staff" && (
                <p className="text-[12px] text-ink-muted">
                  This address is shared only with the caregiver this request was sent to.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[15px]">{careLocationGeneral ?? "General area not available"}</p>
              <p className="text-[12px] text-ink-muted">
                The exact address is shared once you accept this request.
              </p>
            </>
          )}
        </div>
        {viewerRole === "staff" && counterpartyVerificationStatus === "verified" && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-wisteria">
            <ShieldCheck size={16} weight="fill" />
            Verified Parent
            {counterpartyVerificationMethod && (
              <span className="text-ink-muted">
                ({counterpartyVerificationMethod === "carelink" ? "by CareLink" : "by Agency"})
              </span>
            )}
          </p>
        )}
        {booking.one_off_notes && (
          <p className="text-[13px] text-ink-muted">{booking.one_off_notes}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-hairline pt-3 text-[13px] text-ink-muted">
          <span>
            Duration:{" "}
            {(booking.duration_days ?? 1) > 1
              ? `${booking.duration_hours} hrs/day · ${booking.duration_days} days`
              : `${booking.duration_hours} hrs`}
          </span>
          <span>Rate: GH₵{booking.hourly_rate}/hr</span>
          {booking.status === "accepted" && <span>Payment: Pending</span>}
          {["paid", "active", "completed"].includes(booking.status) && <span>Payment: Paid</span>}
          <span className="text-[19px] font-semibold tabular-nums text-ink">
            GH₵{booking.total_amount}
          </span>
        </div>
      </Sheet>

      {wards.length > 0 && !parentAwaitingPayment && (
        <Sheet id="care-profile" className="flex flex-col gap-3 scroll-mt-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            {wards.length === 1 ? "Care profile" : `Care profiles · ${wards.length} children`}
          </h2>
          <WardCareProfileList wards={wards} />
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

      {events.length > 0 && !parentAwaitingPayment && (
        <Sheet className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Booking timeline
          </h2>
          <ul className="flex flex-col gap-2">
            {bookingStages(booking, events).map((stage) => (
              <li key={stage.label} className="flex items-center gap-2.5 text-[13px]">
                {stage.done ? (
                  <CheckCircle
                    size={16}
                    weight="fill"
                    className="shrink-0 text-[var(--color-success)]"
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-hairline" />
                )}
                <span className={stage.done ? "text-ink" : "text-ink-muted"}>{stage.label}</span>
                {stage.at && (
                  <span className="ml-auto text-[12px] text-ink-muted">
                    {formatDateTime(stage.at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {/* Messaging opens once the booking is paid for — 'accepted'
          (awaiting payment) has no conversation yet, so no link. */}
      {["paid", "active", "completed"].includes(booking.status) && (
        <Link href={`/${viewerRole}/messages/${id}`}>
          <Sheet className="flex items-center justify-between gap-3 hover:border-wisteria/50">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <ChatCircleText size={18} className="text-wisteria" />
              Messages
            </span>
            <span className="text-[13px] font-semibold text-wisteria">Open conversation</span>
          </Sheet>
        </Link>
      )}

      {error && <p className="text-[13px] text-error">{error}</p>}

      <div className="flex flex-col gap-3">
        {viewerRole === "staff" && booking.status === "pending" && confirming === null && (
          <div className="flex gap-3">
            <Button size="lg" onClick={() => setConfirming("accept")}>
              Accept
            </Button>
            <Button size="lg" variant="danger" onClick={() => setConfirming("decline")}>
              Decline
            </Button>
          </div>
        )}

        {viewerRole === "staff" && booking.status === "pending" && confirming === "accept" && (
          <Sheet className="flex flex-col gap-3">
            <p className="text-[14px] font-semibold text-ink">Accept this care request?</p>
            <p className="text-[13px] text-ink-muted">
              You&apos;re agreeing to provide care at the date and time shown above.
            </p>
            <div className="flex gap-3">
              <Button size="lg" disabled={busy} onClick={() => void act("/accept")}>
                Accept Request
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                Never mind
              </Button>
            </div>
          </Sheet>
        )}

        {viewerRole === "staff" && booking.status === "pending" && confirming === "decline" && (
          <Sheet className="flex flex-col gap-3">
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
              />
            </label>
            <div className="flex gap-3">
              <Button
                size="lg"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void act("/decline", declineReason.trim() ? { reason: declineReason.trim() } : {})
                }
              >
                Decline Request
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                Never mind
              </Button>
            </div>
          </Sheet>
        )}

        {/* A session starts on its own once its scheduled time arrives
            (lib/services/session-lifecycle.ts) — ending one is the only
            action left for the caregiver to take. The parent only ever
            watches it happen (the "Session in progress" card on their
            own home page, and the read-only location view below). */}
        {viewerRole === "staff" && booking.status === "active" && (
          <SessionActionButton bookingId={id} status={booking.status} onChanged={load} size="lg" />
        )}

        {viewerRole === "parent" && booking.status === "completed" && <ReviewForm bookingId={id} />}

        {viewerRole === "staff" && booking.status === "completed" && (
          <CaregiverReviewForm bookingId={id} />
        )}

        {viewerRole === "parent" && canCancel && <CancelForm bookingId={id} onCancelled={load} />}
      </div>

      {viewerRole === "staff" && (
        <SafeTrackCaregiverControl bookingId={id} bookingStatus={booking.status} />
      )}
      {viewerRole === "parent" && (
        <CaregiverLocationView bookingId={id} active={booking.status === "active"} />
      )}

      {!["pending", "declined"].includes(booking.status) &&
        counterpartyUserId &&
        !parentAwaitingPayment && (
          <Sheet className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <ShieldCheck size={16} className="text-wisteria" />
              {viewerRole === "staff" ? "Safety & Support" : "CareLink Safety"}
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
      <h2 className="text-[15px] font-semibold font-heading">Cancel this booking?</h2>
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
  const router = useRouter();
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
      // Straight back to the parent's home once the review is in.
      router.push("/parent");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <p className="text-[15px] text-ink-muted">Thanks for your review.</p>;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold font-heading">Leave a review</h2>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`rounded border px-3 py-2 text-[15px] font-semibold ${
              rating === n
                ? "border-wisteria bg-wisteria/10 text-wisteria-pressed"
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

// The caregiver -> parent direction. Checks on load whether this
// booking already has a caregiver_reviews row (GET
// /api/bookings/[id]/caregiver-review) rather than always showing the
// form the way ReviewForm above does — a caregiver revisiting a
// completed booking they've already reviewed should never see the
// submission form again, per the CareLink review model.
function CaregiverReviewForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ review: { id: string } | null }>(`/api/bookings/${bookingId}/caregiver-review`)
      .then((res) => {
        if (cancelled) return;
        setAlreadyReviewed(res.review !== null);
      })
      .catch(() => {
        // Fail open to the form — the POST route's own duplicate-key
        // guard is the real protection either way.
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/caregiver-review`, {
        method: "POST",
        body: { rating, comment: comment || undefined },
      });
      setDone(true);
      // Straight back to the caregiver's home once the review is in.
      router.push("/staff");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <Skeleton className="h-40 w-full" />;
  if (done || alreadyReviewed) {
    return <p className="text-[15px] text-ink-muted">Review submitted</p>;
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold font-heading">Leave a review for this family</h2>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`rounded border px-3 py-2 text-[15px] font-semibold ${
              rating === n
                ? "border-wisteria bg-wisteria/10 text-wisteria-pressed"
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
        {submitting ? "Submitting…" : "Submit Review"}
      </Button>
    </Sheet>
  );
}
