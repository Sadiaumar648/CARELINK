"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarBlank, ChatCircle, MapPin, ShieldWarning, Tray } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { minutesAgoLabel } from "@/lib/relative-time";

type Booking = {
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

// A live countdown derived from a real server timestamp, not a
// frontend-owned timer — the backend (the parent's own poll of the
// dispatch status) is what actually expires the offer; this only
// displays what's already true.
function useCountdown(expiresAt: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      void Promise.resolve().then(() => setLabel(null));
      return;
    }
    function tick() {
      const msLeft = new Date(expiresAt!).getTime() - Date.now();
      if (msLeft <= 0) {
        setLabel("Expiring…");
        return;
      }
      const totalSeconds = Math.floor(msLeft / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setLabel(`${minutes}:${String(seconds).padStart(2, "0")}`);
    }
    // The first tick is a synchronous derived read, deferred out of the
    // effect body itself, same as this codebase's established pattern;
    // every tick after that runs from the interval's own callback.
    void Promise.resolve().then(tick);
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return label;
}

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

function RequestCard({ booking, onRespond }: { booking: Booking; onRespond: () => void }) {
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
            {formatRange(booking.starts_at, booking.ends_at)}
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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// A short, additive summary above the existing request list below —
// it never replaces Schedule/Messages/Safety as the real destinations,
// it just surfaces a quick glance at them. "Today" reuses the same
// GET /api/bookings the Schedule page already calls; no new endpoint.
function DashboardSummary({ pendingCount }: { pendingCount: number | null }) {
  const { user } = useAuth();
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];
  const [todaysBooking, setTodaysBooking] = useState<Booking | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => {
        const today = new Date().toISOString().slice(0, 10);
        const match = res.bookings
          .filter(
            (b) =>
              ["accepted", "paid", "active"].includes(b.status) &&
              b.starts_at.slice(0, 10) === today,
          )
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
        setTodaysBooking(match ?? null);
      })
      .catch(() => setTodaysBooking(null));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold font-heading">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-[14px] text-ink-muted">
          Here&apos;s what&apos;s happening with your care today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Sheet className="flex flex-col gap-1.5">
          <Tray size={18} className="text-wisteria" />
          <span className="text-[20px] font-semibold tabular-nums">{pendingCount ?? "…"}</span>
          <span className="text-[12px] text-ink-muted">
            {pendingCount === 1 ? "request waiting" : "requests waiting"}
          </span>
        </Sheet>

        <Sheet className="flex flex-col gap-1.5">
          <CalendarBlank size={18} className="text-wisteria" />
          {todaysBooking === undefined ? (
            <span className="text-[13px] text-ink-muted">…</span>
          ) : todaysBooking ? (
            <>
              <span className="text-[15px] font-semibold text-ink">
                {formatTime(todaysBooking.starts_at)}
              </span>
              <Link
                href={`/staff/schedule/${todaysBooking.id}`}
                className="text-[12px] font-semibold text-wisteria hover:text-wisteria-hover"
              >
                Today&apos;s booking
              </Link>
            </>
          ) : (
            <span className="text-[12px] text-ink-muted">No care scheduled today</span>
          )}
        </Sheet>

        <Link href="/staff/messages">
          <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
            <ChatCircle size={18} className="text-wisteria" />
            <span className="text-[13px] font-semibold text-ink">Messages</span>
          </Sheet>
        </Link>

        <Link href="/staff/safety">
          <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
            <ShieldWarning size={18} className="text-error" />
            <span className="text-[13px] font-semibold text-ink">Safety</span>
          </Sheet>
        </Link>
      </div>
    </div>
  );
}

// How often the location fix is refreshed while Available — well under
// MAX_DISPATCH_LOCATION_AGE_SECONDS (10 minutes, backend/dispatch-
// config.ts) so a caregiver who leaves the tab open stays fresh, but
// nowhere near continuous watchPosition tracking. Only runs at all
// while dispatch_available is true; stops immediately on Off Duty or
// leaving the page (Part 4/9's "no 24/7 tracking" rule).
const LOCATION_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

type DispatchStatus = { available: boolean; updatedAt: string | null };

// CareLink location system, Part 4 — the caregiver's own control for
// live dispatch eligibility. Location is only ever requested once the
// caregiver explicitly taps this, same discipline as SafeTrack
// (components/safe-track.tsx): never on page load, never silently.
function GoAvailableControl() {
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<DispatchStatus>("/api/staff/dispatch-status")
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function stopRefreshing() {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
  }

  // The one shared step both the initial "Go Available" tap and every
  // periodic refresh use — a fresh GPS fix, sent up immediately.
  function captureAndSend(onDone: (result: DispatchStatus | null) => void) {
    if (!navigator.geolocation) {
      onDone(null);
      setError("Your device doesn't support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        apiFetch<{ available: boolean }>("/api/staff/dispatch-status", {
          method: "POST",
          body: {
            available: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        })
          .then(() => onDone({ available: true, updatedAt: new Date().toISOString() }))
          .catch((err) => {
            setError(errorMessage(err));
            onDone(null);
          });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Enable it in your browser's site settings to go Available."
            : "We couldn't get your location right now. Try again in a moment.",
        );
        onDone(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function goAvailable() {
    setError(null);
    setBusy(true);
    captureAndSend((result) => {
      setBusy(false);
      if (!result) return;
      setStatus(result);
      stopRefreshing();
      refreshTimer.current = setInterval(() => {
        captureAndSend((refreshed) => {
          if (refreshed) setStatus(refreshed);
        });
      }, LOCATION_REFRESH_INTERVAL_MS);
    });
  }

  function goOffDuty() {
    setError(null);
    setBusy(true);
    stopRefreshing();
    apiFetch<{ available: boolean }>("/api/staff/dispatch-status", {
      method: "POST",
      body: { available: false },
    })
      .then(() => setStatus({ available: false, updatedAt: null }))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  }

  useEffect(() => stopRefreshing, []);

  if (!status) return null;

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <MapPin size={18} className={status.available ? "text-wisteria" : "text-ink-muted"} />
          {status.available ? "You're Available for dispatch" : "You're Off Duty"}
        </h2>
        <Button
          size="lg"
          variant={status.available ? "secondary" : "primary"}
          onClick={status.available ? goOffDuty : goAvailable}
          disabled={busy}
        >
          {busy ? "Updating…" : status.available ? "Go Off Duty" : "Go Available"}
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-muted">
        Location access is required while you&apos;re Available so CareLink can match you with
        nearby care requests. This is separate from being on an active booking — you can turn it off
        anytime, and CareLink never tracks your location while you&apos;re Off Duty.
      </p>
      {status.available && status.updatedAt && (
        <p className="text-[12px] text-ink-muted">
          Location last updated {minutesAgoLabel(status.updatedAt)}
        </p>
      )}
      {error && <p className="text-[13px] text-error">{error}</p>}
    </Sheet>
  );
}

export default function StaffRequestsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings?status=pending")
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <DashboardSummary pendingCount={bookings?.length ?? null} />
      <GoAvailableControl />

      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-semibold font-heading">Care Requests</h2>
        <p className="text-[14px] text-ink-muted">
          Families who&apos;d like to book you are shown here.
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && bookings === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && bookings?.length === 0 && (
        <EmptyState
          icon={Tray}
          title="No new care requests"
          description="When families request your services, they'll appear here."
        />
      )}

      {!error && bookings && bookings.length > 0 && (
        <div className="flex flex-col gap-4">
          {bookings.map((b) => (
            <RequestCard key={b.id} booking={b} onRespond={() => setRetryKey((k) => k + 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
