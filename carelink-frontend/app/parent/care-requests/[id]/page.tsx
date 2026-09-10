"use client";

import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChatCircleText,
  CheckCircle,
  Clock,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { useCountdown } from "@/lib/use-countdown";
import { NannyCard, type RecommendedNanny } from "@/components/parent/nanny-card";

// The real, locked terms of the one booking this request created —
// fetched from the existing GET /api/bookings/[id], never recomputed
// here.
type OfferBooking = {
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  duration_days: number | null;
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
  paymentDeadline: string | null;
  paymentExpired: boolean;
};

type DispatchStatus = {
  dispatchStatus:
    | "not_started"
    | "searching"
    | "expanding"
    | "accepted"
    | "exhausted"
    | "cancelled"
    | "preferred_declined";
  vicinityRound: number;
  activeOffer: ActiveOffer | null;
  // The one nanny the parent picked for this request.
  preferredCaregiverName: string | null;
  // On preferred_declined: did the nanny decline, or let the window lapse.
  preferredOutcome: "declined" | "expired" | null;
};

// The saved request row — used to build the "choose another nanny" list
// with the same date/time/location the request already has.
type CareRequestRow = {
  date: string;
  start_time: string;
  end_time: string;
  duration_days: number | null;
  service_latitude: number | null;
  service_longitude: number | null;
};

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

// Fetches the one real booking this request created — from the existing
// GET /api/bookings/[id], never recomputed on this page.
function useOfferBooking(bookingId: string | null) {
  const [booking, setBooking] = useState<OfferBooking | null>(null);
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    apiFetch<{ booking: OfferBooking }>(`/api/bookings/${bookingId}`)
      .then((res) => {
        if (!cancelled) setBooking(res.booking);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bookingId]);
  // Only meaningful while there IS a bookingId — callers gate on that.
  return bookingId ? booking : null;
}

// A fixed 3-step progress card for contacting the one nanny the parent
// picked — no "available caregivers", no expanding search. Step 2 is
// active while the offer is being placed; once it's placed and we're
// waiting on the nanny, step 2 completes and step 3 goes active.
function ContactingProgress({
  nannyName,
  offerPlaced,
}: {
  nannyName: string;
  offerPlaced: boolean;
}) {
  const steps: { label: string; state: "done" | "active" | "pending" }[] = [
    { label: "Care request received", state: "done" },
    { label: `Contacting ${nannyName}`, state: offerPlaced ? "done" : "active" },
    { label: "Waiting for caregiver response", state: offerPlaced ? "active" : "pending" },
  ];
  return (
    <div className="flex w-full flex-col gap-3 rounded-[14px] border border-hairline bg-paper p-4 text-left">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              s.state === "done"
                ? "bg-[var(--color-success)] text-white"
                : s.state === "active"
                  ? "bg-wisteria text-white"
                  : "border border-hairline bg-sheet"
            }`}
          >
            {s.state === "done" ? (
              <CheckCircle size={13} weight="fill" />
            ) : s.state === "active" ? (
              <span className="h-2 w-2 rounded-full bg-white" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/40" />
            )}
          </span>
          <span
            className={`text-[13px] ${
              s.state === "pending"
                ? "text-ink-muted"
                : s.state === "active"
                  ? "font-semibold text-ink"
                  : "text-ink"
            }`}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function RequestDetails({
  nannyName,
  booking,
}: {
  nannyName: string;
  booking: OfferBooking | null;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-[14px] border border-hairline p-4 text-left text-[13px]">
      <DetailRow label="Nanny" value={nannyName} />
      <DetailRow label="Care type" value="Nanny" />
      {booking && (
        <>
          <DetailRow label="Date" value={formatDateLong(booking.starts_at)} />
          <DetailRow label="Time" value={formatTimeRange(booking.starts_at, booking.ends_at)} />
          <DetailRow
            label="Duration"
            value={
              (booking.duration_days ?? 1) > 1
                ? `${booking.duration_hours} hrs/day · ${booking.duration_days} days`
                : `${booking.duration_hours} hours`
            }
          />
        </>
      )}
    </div>
  );
}

// The parent picked a different nanny after their first choice fell
// through — this shows the same Recommended Nannies list, computed from
// the request the parent already saved, and re-targets it at whoever
// they pick (POST .../dispatch/reselect). Never automatic.
function ChooseAnotherNanny({
  careRequestId,
  onReselected,
  onBack,
}: {
  careRequestId: string;
  onReselected: (s: DispatchStatus) => void;
  onBack: () => void;
}) {
  const [nannies, setNannies] = useState<RecommendedNanny[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Builds the recommended-nanny list from the request's own saved
  // date/time/location, minus every caregiver already tried for this
  // request (declined / no response) — they never reappear here.
  async function loadNannies() {
    const { careRequest: cr, triedStaffProfileIds = [] } = await apiFetch<{
      careRequest: CareRequestRow;
      triedStaffProfileIds?: string[];
    }>(`/api/care-requests/${careRequestId}`);
    const params = new URLSearchParams();
    if (cr.service_latitude != null && cr.service_longitude != null) {
      params.set("latitude", String(cr.service_latitude));
      params.set("longitude", String(cr.service_longitude));
    }
    params.set("date", cr.date);
    params.set("startTime", cr.start_time.slice(0, 5));
    params.set("endTime", cr.end_time.slice(0, 5));
    params.set("durationDays", String(cr.duration_days ?? 1));
    params.set("availability", "conflicts");
    const res = await apiFetch<{ results: RecommendedNanny[] }>(
      `/api/search/caregivers?${params.toString()}`,
    );
    const tried = new Set(triedStaffProfileIds);
    return res.results.filter((n) => !tried.has(n.staff_profile_id));
  }

  useEffect(() => {
    let cancelled = false;
    loadNannies()
      .then((results) => {
        if (!cancelled) setNannies(results);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadNannies only depends on careRequestId
  }, [careRequestId]);

  async function requestNanny(staffProfileId: string) {
    setSendingId(staffProfileId);
    setMessage(null);
    try {
      const res = await apiFetch<DispatchStatus>(
        `/api/care-requests/${careRequestId}/dispatch/reselect`,
        { method: "POST", body: { staffProfileId } },
      );
      onReselected(res);
    } catch (err) {
      setSendingId(null);
      if (err instanceof ApiError && err.code === "nanny_unavailable") {
        setMessage(errorMessage(err));
        // Refresh the list so the unavailable nanny drops off.
        setNannies(null);
        loadNannies()
          .then(setNannies)
          .catch(() => setNannies([]));
        return;
      }
      setMessage(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <div>
        <h1 className="text-[19px] font-bold font-heading text-ink">Recommended Nannies</h1>
        <p className="text-[13px] text-ink-muted">
          Based on your care needs, location and schedule, these CareLink nannies may be a good fit.
          Pick one and your request goes only to them.
        </p>
      </div>
      {message && <p className="text-[13px] text-error">{message}</p>}
      {loadError && <ErrorState onRetry={() => setNannies(null)} />}
      {!loadError && nannies === null && (
        <p className="text-[13px] text-ink-muted">Finding nannies for your request…</p>
      )}
      {nannies?.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          No CareLink nannies are available for your requested time right now.
        </p>
      )}
      {nannies && nannies.length > 0 && (
        <div className="flex flex-col gap-3">
          {nannies.map((n) => (
            <NannyCard
              key={n.staff_profile_id}
              nanny={n}
              disabled={sendingId !== null}
              requesting={sendingId === n.staff_profile_id}
              onRequest={() => void requestNanny(n.staff_profile_id)}
              onViewProfile={() =>
                window.open(`/parent/caregivers/${n.staff_profile_id}`, "_blank")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CareRequestDispatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reselecting, setReselecting] = useState(false);

  const active =
    !status ||
    (!["accepted", "exhausted", "cancelled"].includes(status.dispatchStatus) &&
      status.dispatchStatus !== "preferred_declined") ||
    (status.dispatchStatus === "accepted" && status.activeOffer?.status === "accepted");
  useDispatchPolling(id, setStatus, setError, active && !reselecting);

  const pendingOffer =
    status &&
    !["accepted", "exhausted", "cancelled", "preferred_declined"].includes(status.dispatchStatus)
      ? status.activeOffer
      : null;
  const acceptedOffer = status?.dispatchStatus === "accepted" ? (status.activeOffer ?? null) : null;
  const offerAwaitingPayment = acceptedOffer?.status === "accepted";
  const offerPaymentExpired = Boolean(acceptedOffer?.paymentExpired);

  const offerBooking = useOfferBooking(pendingOffer?.bookingId ?? acceptedOffer?.bookingId ?? null);

  // 120-second response window countdown — display only; the backend
  // (advanceDispatch) is what actually expires the offer on the next poll.
  const responseCountdown = useCountdown(pendingOffer?.expiresAt ?? null);
  const paymentCountdown = useCountdown(
    offerAwaitingPayment ? (acceptedOffer?.paymentDeadline ?? null) : null,
  );

  const nannyName =
    status?.preferredCaregiverName ??
    pendingOffer?.caregiverName ??
    acceptedOffer?.caregiverName ??
    "your nanny";

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

  if (reselecting && status) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <ChooseAnotherNanny
          careRequestId={id}
          onReselected={(s) => {
            setStatus(s);
            setReselecting(false);
          }}
          onBack={() => setReselecting(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      {/* Request sent — waiting for the one nanny the parent picked. */}
      {(!status ||
        status.dispatchStatus === "not_started" ||
        status.dispatchStatus === "searching" ||
        status.dispatchStatus === "expanding") && (
        <Sheet className="flex flex-col items-center gap-5 border-[var(--color-lavender-border)] px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wisteria-tint text-wisteria">
            <PaperPlaneTilt size={24} weight="fill" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[19px] font-bold font-heading text-ink">
              We&apos;re contacting your caregiver
            </h1>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              CareLink is contacting {nannyName} about your care request. We&apos;ll update you as
              soon as we receive a response.
            </p>
          </div>

          <RequestDetails nannyName={nannyName} booking={offerBooking} />

          <p className="flex items-center gap-1.5 rounded-full bg-wisteria-tint px-3.5 py-1.5 text-[13px] font-semibold text-wisteria-pressed">
            <Clock size={14} weight="fill" /> Contacting {nannyName}…
            {responseCountdown ? ` · ${responseCountdown}` : ""}
          </p>

          <ContactingProgress nannyName={nannyName} offerPlaced={Boolean(pendingOffer)} />

          <p className="text-[12px] text-ink-muted">
            You can stay on this page while you wait — it updates on its own.
          </p>

          <Button
            variant="secondary"
            onClick={() => void cancel()}
            disabled={cancelling}
            className="border-wisteria bg-sheet text-wisteria hover:bg-wisteria-tint hover:text-wisteria-pressed"
          >
            {cancelling ? "Cancelling…" : "Cancel Search"}
          </Button>
        </Sheet>
      )}

      {/* The picked nanny declined or didn't respond — the parent picks
          another themselves; CareLink never auto-dispatches. */}
      {status?.dispatchStatus === "preferred_declined" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              {status.preferredOutcome === "declined"
                ? `${nannyName} isn't available for this request`
                : `${nannyName} didn't respond in time`}
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              You can choose another nanny from your recommended nannies.
            </p>
          </div>
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => setReselecting(true)}>Choose Another Nanny</Button>
            <Button variant="secondary" onClick={() => void cancel()} disabled={cancelling}>
              Cancel request
            </Button>
          </div>
        </Sheet>
      )}

      {/* Nanny accepted → complete payment. Existing flow, unchanged. */}
      {acceptedOffer && offerAwaitingPayment && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <CheckCircle size={40} weight="fill" className="text-[var(--color-success)]" />
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              {nannyName} accepted your request
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              Complete payment to confirm your booking.
            </p>
          </div>

          {paymentCountdown && (
            <p className="rounded-full bg-error-tint px-3 py-1 text-[12.5px] font-semibold text-error">
              Payment required within {paymentCountdown}
            </p>
          )}

          {offerBooking && (
            <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-[14px] border border-hairline p-4 text-left text-[13px]">
              <DetailRow label="Nanny" value={nannyName} />
              <DetailRow label="Care type" value="Nanny" />
              <DetailRow label="Date" value={formatDateLong(offerBooking.starts_at)} />
              <DetailRow
                label="Time"
                value={formatTimeRange(offerBooking.starts_at, offerBooking.ends_at)}
              />
              <DetailRow
                label="Duration"
                value={
                  (offerBooking.duration_days ?? 1) > 1
                    ? `${offerBooking.duration_hours} hrs/day · ${offerBooking.duration_days} days`
                    : `${offerBooking.duration_hours} hours`
                }
              />
              <DetailRow label="Rate" value={`GH₵${offerBooking.hourly_rate}/hour`} />
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
              href={`/parent/caregivers/${acceptedOffer.staffProfileId}`}
              variant="secondary"
            >
              View Nanny
            </LinkButton>
            <LinkButton href={`/parent/messages/${acceptedOffer.bookingId}`} variant="secondary">
              <ChatCircleText size={16} /> Message {nannyName.split(" ")[0]}
            </LinkButton>
            <LinkButton href={`/parent/bookings/${acceptedOffer.bookingId}`}>
              Pay &amp; Confirm Booking
            </LinkButton>
          </div>
        </Sheet>
      )}

      {acceptedOffer && offerPaymentExpired && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <h1 className="text-[19px] font-bold font-heading text-ink">Payment window expired</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {nannyName} is no longer reserved for this booking. You can request care again when
            you&apos;re ready.
          </p>
          <LinkButton href={`/parent?retryCareRequestId=${id}`}>Request Care Again</LinkButton>
        </Sheet>
      )}

      {status?.dispatchStatus === "exhausted" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              This request couldn&apos;t be completed
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              Your request details are saved, so you can review them and try again.
            </p>
          </div>
          <LinkButton href={`/parent?retryCareRequestId=${id}`}>Request Care Again</LinkButton>
        </Sheet>
      )}

      {status?.dispatchStatus === "cancelled" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <h1 className="text-[19px] font-bold font-heading text-ink">Request cancelled</h1>
          <LinkButton href="/parent" variant="secondary">
            Back to Home
          </LinkButton>
        </Sheet>
      )}

      {error && status && <p className="text-center text-[13px] text-error">{error}</p>}
    </div>
  );
}
