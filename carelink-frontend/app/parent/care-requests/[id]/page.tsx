"use client";

import { use, useEffect, useState } from "react";
import { ChatCircleText, CheckCircle, MagnifyingGlass, MapPin, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { caregiverTypeLabel } from "@/components/find-care/types";
import { useCountdown } from "@/lib/use-countdown";

// The real, locked terms of the one booking dispatch created for this
// offer — fetched from the existing GET /api/bookings/[id] (the same
// route booking-detail.tsx already uses), never recomputed here. This
// is what makes the "Caregiver found!" card's price/date/time real
// instead of guessed: it's the exact row payment will later charge.
type OfferBooking = {
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  hourly_rate: number;
  total_amount: number;
  status: string;
};

type ActiveOffer = {
  bookingId: string;
  staffProfileId: string;
  caregiverName: string;
  hourlyRate: number;
  expiresAt: string | null;
  status: string;
  // CareLink's finalized payment workflow, Part 4 — see
  // lib/services/payment-window.ts (backend) for where these are
  // actually computed and enforced; never derived on this page.
  paymentDeadline: string | null;
  paymentExpired: boolean;
};

type DispatchStatus = {
  dispatchStatus:
    "not_started" | "searching" | "expanding" | "accepted" | "exhausted" | "cancelled";
  vicinityRound: number;
  activeOffer: ActiveOffer | null;
};

// Polls the dispatch status endpoint — the poll itself is what advances
// the queue server-side (expiring a timed-out offer, moving to the next
// caregiver, expanding the vicinity), the same pattern this app already
// uses for payment status (usePaymentPolling in booking-detail.tsx) and
// SafeTrack location, rather than introducing a new realtime channel.
function useDispatchPolling(
  careRequestId: string,
  onUpdate: (s: DispatchStatus) => void,
  onError: (message: string) => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    function poll() {
      apiFetch<DispatchStatus>(`/api/care-requests/${careRequestId}/dispatch`)
        .then((res) => {
          if (!cancelled) onUpdate(res);
        })
        .catch((err) => {
          if (!cancelled) onError(errorMessage(err));
        });
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the id or active flag changes
  }, [careRequestId, active]);
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time(startsAt)} – ${time(endsAt)}`;
}

// Fetches the one real booking this offer created, plus the caregiver's
// declared type — both from existing routes (GET /api/bookings/[id],
// already used by booking-detail.tsx; GET /api/caregivers/[id], already
// used by the caregiver profile page) rather than trusting or
// recomputing anything on this page.
function useOfferDetails(bookingId: string | null, staffProfileId: string | null) {
  const [booking, setBooking] = useState<OfferBooking | null>(null);
  const [caregiverType, setCaregiverType] = useState<"nanny" | "babysitter" | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    apiFetch<{ booking: OfferBooking }>(`/api/bookings/${bookingId}`)
      .then((res) => setBooking(res.booking))
      .catch(() => undefined);
  }, [bookingId]);

  useEffect(() => {
    if (!staffProfileId) return;
    apiFetch<{ caregiver: { caregiver_type: "nanny" | "babysitter" | null } }>(
      `/api/caregivers/${staffProfileId}`,
    )
      .then((res) => setCaregiverType(res.caregiver.caregiver_type))
      .catch(() => undefined);
  }, [staffProfileId]);

  return { booking, caregiverType };
}

const TERMINAL = new Set(["accepted", "exhausted", "cancelled"]);

const CHECKLIST_LABELS = [
  "Care request received",
  "Contacting available caregivers",
  "Expanding search if needed",
  "Caregiver confirmation",
] as const;

// A step is "done" (✓), "active" (●), or "pending" (○) purely from the
// real dispatchStatus/vicinityRound already being polled — no separate
// client-side state to drift out of sync with the backend.
function checklistStates(status: DispatchStatus): ("done" | "active" | "pending")[] {
  const { dispatchStatus, vicinityRound } = status;
  if (dispatchStatus === "cancelled") return ["done", "pending", "pending", "pending"];
  if (dispatchStatus === "accepted") return ["done", "done", "done", "done"];
  if (dispatchStatus === "exhausted") return ["done", "done", "done", "pending"];
  if (dispatchStatus === "expanding") return ["done", "done", "active", "pending"];
  // searching / not_started
  return vicinityRound > 0
    ? ["done", "done", "active", "pending"]
    : ["done", "active", "pending", "pending"];
}

function ProgressChecklist({ status }: { status: DispatchStatus }) {
  const states = checklistStates(status);
  return (
    <div className="flex flex-col gap-1.5 text-[12.5px]">
      {CHECKLIST_LABELS.map((label, i) => (
        <p
          key={label}
          className={
            states[i] === "done"
              ? "text-[var(--color-success)]"
              : states[i] === "active"
                ? "font-semibold text-wisteria"
                : "text-ink-muted"
          }
        >
          {states[i] === "done" ? "✓" : states[i] === "active" ? "●" : "○"} {label}
        </p>
      ))}
    </div>
  );
}

export default function CareRequestDispatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Polling must keep running through the whole "accepted" state, not
  // just stop the moment a caregiver accepts — the payment window's own
  // expiry (or a successful payment) only ever becomes visible through
  // another poll, since dispatch_status itself never changes again once
  // it reaches 'accepted'. Only actually stops once the underlying
  // booking has resolved away from 'accepted' (paid, or the payment
  // window's own lazy sweep cancelled it).
  const active =
    !status ||
    !TERMINAL.has(status.dispatchStatus) ||
    (status.dispatchStatus === "accepted" && status.activeOffer?.status === "accepted");
  useDispatchPolling(id, setStatus, setError, active);

  const activeOffer = status?.dispatchStatus === "accepted" ? (status.activeOffer ?? null) : null;
  const offerAwaitingPayment = activeOffer?.status === "accepted";
  const offerPaymentExpired = Boolean(activeOffer?.paymentExpired);
  const { booking: offerBooking, caregiverType } = useOfferDetails(
    activeOffer?.bookingId ?? null,
    activeOffer?.staffProfileId ?? null,
  );
  // The real countdown to the payment deadline — only ever ticking while
  // the offer is genuinely still awaiting payment. The backend
  // (lib/services/payment-window.ts) is what actually enforces this;
  // this is a display only.
  const paymentCountdown = useCountdown(
    offerAwaitingPayment ? (activeOffer?.paymentDeadline ?? null) : null,
  );

  async function cancel() {
    setCancelling(true);
    try {
      await apiFetch(`/api/care-requests/${id}/dispatch/cancel`, { method: "POST" });
      setStatus((s) => (s ? { ...s, dispatchStatus: "cancelled" } : s));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  if (error && !status) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState onRetry={() => setError(null)} />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center">
        <p className="text-[14px] text-ink-muted">Starting your search…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      {(status.dispatchStatus === "not_started" || status.dispatchStatus === "searching") && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wisteria-tint text-wisteria">
            <MagnifyingGlass size={26} weight="bold" />
          </span>
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              We&apos;re finding your caregiver
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              CareLink is checking verified, available caregivers near your care location, one at a
              time. This might take a while.
            </p>
          </div>
          {status.activeOffer && (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <MapPin size={15} className="text-wisteria" /> Contacting{" "}
              {status.activeOffer.caregiverName}…
            </p>
          )}
          <ProgressChecklist status={status} />
          <p className="text-[12px] text-ink-muted">Please stay on this screen while we search.</p>
          <Button variant="secondary" onClick={() => void cancel()} disabled={cancelling}>
            <X size={15} /> Cancel Search
          </Button>
        </Sheet>
      )}

      {status.dispatchStatus === "expanding" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wisteria-tint text-wisteria">
            <MapPin size={26} weight="bold" />
          </span>
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              We&apos;re expanding your search
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              We couldn&apos;t find an available caregiver nearby yet. CareLink is checking the next
              closest eligible caregivers.
            </p>
          </div>
          {status.activeOffer && (
            <p className="text-[13px] font-semibold text-ink">
              Contacting {status.activeOffer.caregiverName}…
            </p>
          )}
          <ProgressChecklist status={status} />
          <Button variant="secondary" onClick={() => void cancel()} disabled={cancelling}>
            <X size={15} /> Cancel Search
          </Button>
        </Sheet>
      )}

      {status.dispatchStatus === "accepted" && status.activeOffer && offerAwaitingPayment && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <CheckCircle size={40} weight="fill" className="text-[var(--color-success)]" />
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">Caregiver found!</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              Your caregiver has accepted this request. Complete payment to confirm your booking.
            </p>
          </div>

          {paymentCountdown && (
            <p className="rounded-full bg-error-tint px-3 py-1 text-[12.5px] font-semibold text-error">
              Payment required within {paymentCountdown}
            </p>
          )}

          {/* The real, locked terms of this offer — every figure here
              comes straight from the booking row payment will charge,
              never recomputed on this page. */}
          {offerBooking && (
            <div className="flex w-full max-w-xs flex-col gap-1.5 rounded-[14px] border border-hairline p-4 text-left text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Caregiver</span>
                <span className="font-semibold">{status.activeOffer.caregiverName}</span>
              </div>
              {caregiverType && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Care type</span>
                  <span className="font-semibold">{caregiverTypeLabel(caregiverType)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-muted">Date</span>
                <span className="font-semibold">{formatDateLong(offerBooking.starts_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Time</span>
                <span className="font-semibold">
                  {formatTimeRange(offerBooking.starts_at, offerBooking.ends_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Duration</span>
                <span className="font-semibold">{offerBooking.duration_hours} hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Rate</span>
                <span className="font-semibold tabular-nums">
                  GH₵{offerBooking.hourly_rate}/hour
                </span>
              </div>
              <div className="flex justify-between border-t border-hairline pt-1.5">
                <span className="text-ink-muted">Total</span>
                <span className="text-[16px] font-bold tabular-nums text-ink">
                  GH₵{offerBooking.total_amount}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <LinkButton
              href={`/parent/caregivers/${status.activeOffer.staffProfileId}`}
              variant="secondary"
            >
              View Caregiver
            </LinkButton>
            <LinkButton
              href={`/parent/messages/${status.activeOffer.bookingId}`}
              variant="secondary"
            >
              <ChatCircleText size={16} /> Message {status.activeOffer.caregiverName.split(" ")[0]}
            </LinkButton>
            <LinkButton href={`/parent/bookings/${status.activeOffer.bookingId}`}>
              Pay & Confirm Booking
            </LinkButton>
          </div>
        </Sheet>
      )}

      {status.dispatchStatus === "accepted" && status.activeOffer && offerPaymentExpired && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <h1 className="text-[19px] font-bold font-heading text-ink">Payment window expired</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            This caregiver is no longer reserved for this booking. You can request care again when
            you&apos;re ready.
          </p>
          <LinkButton href="/parent">Request Care Again</LinkButton>
        </Sheet>
      )}

      {/* The sequential dispatch queue genuinely ran out of eligible
          caregivers to offer this request to — both vicinity rounds
          exhausted (lib/services/dispatch.ts), not a frontend guess, so
          the copy says so plainly rather than "still looking." CareLink's
          finalized workflow never falls back to manual caregiver
          browsing from here, and never sends the parent back to a blank
          Home to start over — Request Care Again reopens the real,
          saved request (via ?retryCareRequestId, read from GET
          /api/care-requests/[id] — see app/parent/page.tsx), fully
          editable, with Find Care still the one action that starts a
          new search. Opening/refreshing/revisiting this link only ever
          reads that record; nothing is created until the parent submits
          the restored form. */}
      {status.dispatchStatus === "exhausted" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              We couldn&apos;t find the right caregiver this time
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              We couldn&apos;t secure an eligible caregiver for this request right now. Your request
              details are saved, so you can review them and try again.
            </p>
          </div>
          <LinkButton href={`/parent?retryCareRequestId=${id}`}>Request Care Again</LinkButton>
        </Sheet>
      )}

      {status.dispatchStatus === "cancelled" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <h1 className="text-[19px] font-bold font-heading text-ink">Search cancelled</h1>
          <LinkButton href="/parent" variant="secondary">
            Back to Home
          </LinkButton>
        </Sheet>
      )}

      {error && <p className="text-center text-[13px] text-error">{error}</p>}
    </div>
  );
}
