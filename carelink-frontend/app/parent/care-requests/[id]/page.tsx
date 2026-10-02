"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, PaperPlaneTilt } from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { Button, LinkButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ErrorState } from "@/components/ui/empty-state";
import { NannyCard, type RecommendedNanny } from "@/components/parent/nanny-card";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type ActiveOffer = {
  bookingId: string;
  staffProfileId: string;
  caregiverName: string;
  hourlyRate: number;
  status: string;
};

type DispatchStatus = {
  dispatchStatus:
    "not_started" | "searching" | "expanding" | "accepted" | "exhausted" | "cancelled";
  vicinityRound: number;
  activeOffer: ActiveOffer | null;
  // The caregiver currently assigned to this request.
  assignedCaregiverName: string | null;
};

// The saved request row — used to build the "browse other caregivers"
// list with the same date/time/location the request already has.
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

// The assigned caregiver's own photo — from the existing GET
// /api/caregivers/[id] (same route the full profile page already
// uses), never fabricated or reused from a placeholder.
function useCaregiverPhoto(staffProfileId: string | null): string | null {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  useEffect(() => {
    if (!staffProfileId) {
      void Promise.resolve().then(() => setPhotoPath(null));
      return;
    }
    let cancelled = false;
    apiFetch<{ caregiver: { photo_path: string | null } }>(`/api/caregivers/${staffProfileId}`)
      .then((res) => {
        if (!cancelled) setPhotoPath(res.caregiver.photo_path);
      })
      .catch(() => {
        if (!cancelled) setPhotoPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [staffProfileId]);
  return photoPath;
}

// The parent doesn't want the auto-assigned caregiver and picks someone
// else themselves — the same Recommended Caregivers-style list, computed
// from the request the parent already saved, re-targets the request at
// whoever they pick (POST .../dispatch/reselect). Never automatic.
function ChooseAnotherNanny({
  careRequestId,
  onReselected,
  onBack,
}: {
  careRequestId: string;
  onReselected: (s: DispatchStatus) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [nannies, setNannies] = useState<RecommendedNanny[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadNannies() {
    const { careRequest: cr } = await apiFetch<{ careRequest: CareRequestRow }>(
      `/api/care-requests/${careRequestId}`,
    );
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
    return res.results;
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
        <h1 className="text-[19px] font-bold font-heading text-ink">Browse Other Caregivers</h1>
        <p className="text-[13px] text-ink-muted">
          Based on your care needs, location and schedule, these CareLink caregivers are also
          available. Pick one to switch your assignment to them.
        </p>
      </div>
      {message && <p className="text-[13px] text-error">{message}</p>}
      {loadError && <ErrorState onRetry={() => setNannies(null)} />}
      {!loadError && nannies === null && (
        <p className="text-[13px] text-ink-muted">Finding caregivers for your request…</p>
      )}
      {nannies?.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          No other CareLink caregivers are available for your requested time right now.
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
                router.push(
                  `/parent/caregivers/${n.staff_profile_id}?careRequestId=${careRequestId}`,
                )
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
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reselecting, setReselecting] = useState(false);

  // Arriving here with ?reselect=1 (the caregiver profile page's "Not
  // the right fit? Browse other caregivers", once a parent has already
  // clicked through to View Nanny) opens the same picker directly,
  // rather than landing back on the plain matched screen first.
  useEffect(() => {
    if (searchParams.get("reselect") === "1") {
      void Promise.resolve().then(() => setReselecting(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount only
  }, []);

  const active =
    !status ||
    !["exhausted", "cancelled"].includes(status.dispatchStatus) ||
    (status.dispatchStatus === "accepted" && status.activeOffer?.status === "accepted");
  // Deliberately NOT gated on `!reselecting` — arriving here straight
  // at ?reselect=1 (from the caregiver profile's "Not the right fit?")
  // sets reselecting=true almost immediately, before `status` has ever
  // loaded; gating polling on it too used to mean the very first fetch
  // got cancelled before it could complete, leaving `status` null
  // forever and the picker never actually rendering. Harmless to keep
  // polling in the background while reselecting is shown — it just
  // keeps status fresh underneath, the picker's own render doesn't
  // depend on it either way.
  useDispatchPolling(id, setStatus, setError, active);

  const searching =
    !status || ["not_started", "searching", "expanding"].includes(status.dispatchStatus);
  const acceptedOffer = status?.dispatchStatus === "accepted" ? (status.activeOffer ?? null) : null;
  const offerAwaitingPayment = acceptedOffer?.status === "accepted";

  const nannyName =
    status?.assignedCaregiverName ?? acceptedOffer?.caregiverName ?? "your caregiver";
  const nannyPhotoPath = useCaregiverPhoto(acceptedOffer?.staffProfileId ?? null);

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
      {/* Matching — CareLink is finding and assigning the top-ranked
          eligible caregiver. No one has to respond, so this typically
          resolves on the very first poll; kept brief on purpose. */}
      {searching && (
        <Sheet className="flex flex-col items-center gap-5 border-[var(--color-lavender-border)] px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wisteria-tint text-wisteria">
            <PaperPlaneTilt size={24} weight="fill" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[19px] font-bold font-heading text-ink">Finding your caregiver…</h1>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              CareLink is matching your care request with an available caregiver. This only takes a
              moment.
            </p>
          </div>

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

      {/* Matched — payment, caregiver details, and the option to switch
          all live one tap away, on the caregiver's own profile
          (View Nanny), so this screen stays to the point. */}
      {acceptedOffer && offerAwaitingPayment && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <Avatar photoUrl={caregiverPhotoUrl(nannyPhotoPath)} name={nannyName} size="lg" />
          <h1 className="text-[19px] font-bold font-heading text-ink">
            You&apos;ve been matched with {nannyName}
          </h1>

          <LinkButton
            href={`/parent/caregivers/${acceptedOffer.staffProfileId}?bookingId=${acceptedOffer.bookingId}`}
          >
            View Nanny
          </LinkButton>
        </Sheet>
      )}

      {status?.dispatchStatus === "exhausted" && (
        <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] py-10 text-center">
          <div>
            <h1 className="text-[19px] font-bold font-heading text-ink">
              This request couldn&apos;t be completed
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              No caregiver is available for your requested time right now. Your request details are
              saved, so you can review them and try again.
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
