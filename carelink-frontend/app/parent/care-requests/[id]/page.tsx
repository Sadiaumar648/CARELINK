"use client";

import { use, useEffect, useState } from "react";
import { ChatCircleText, CheckCircle, MagnifyingGlass, MapPin, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";

type ActiveOffer = {
  bookingId: string;
  staffProfileId: string;
  caregiverName: string;
  hourlyRate: number;
  expiresAt: string | null;
  status: string;
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

  const active = !status || !TERMINAL.has(status.dispatchStatus);
  useDispatchPolling(id, setStatus, setError, active);

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
            <h1 className="text-[19px] font-bold font-heading text-ink">Hold on a minute…</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              We&apos;re finding the right care for you. This might take a while — we&apos;re
              contacting verified caregivers near your care location, one at a time.
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
            <h1 className="text-[19px] font-bold font-heading text-ink">Expanding your search</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              We couldn&apos;t find an available caregiver in the immediate area. CareLink is
              checking the next closest eligible caregivers.
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

      {status.dispatchStatus === "accepted" && status.activeOffer && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <CheckCircle size={40} weight="fill" className="text-[var(--color-success)]" />
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">Caregiver found!</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              {status.activeOffer.caregiverName} accepted your care request. You can message them
              directly or continue to the booking.
            </p>
          </div>
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
            <LinkButton href={`/parent/bookings/${status.activeOffer.bookingId}`} variant="accent">
              Continue to Booking
            </LinkButton>
          </div>
        </Sheet>
      )}

      {status.dispatchStatus === "exhausted" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              We&apos;re still looking for a caregiver
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              Nobody was available to accept this request right now. You can browse caregivers
              yourself instead, or try again later.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <LinkButton href="/parent/find-care" variant="accent">
              Browse Caregivers
            </LinkButton>
            <LinkButton href="/parent" variant="secondary">
              Back to Home
            </LinkButton>
          </div>
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
