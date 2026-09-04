"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarBlank, CalendarCheck, MapPin, Sparkle, Tray, Wallet } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { minutesAgoLabel } from "@/lib/relative-time";
import { useCountdown } from "@/lib/use-countdown";

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatTodayLong(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Unchanged from before this redesign — the actual Accept/Decline
// mechanism for a pending request. CareLink's finalized workflow
// ("Incoming care requests" is one of the five things this dashboard is
// built around) keeps this front and centre on Home, just restyled to
// sit beneath the new availability/stats sections rather than being the
// very first thing on the page.
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

// The page header: greeting (real authenticated name, never hardcoded)
// + supporting text + today's date where space permits.
function DashboardHeader() {
  const { user } = useAuth();
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-[14px] text-ink-muted">
          Here&apos;s what&apos;s happening with your care today.
        </p>
      </div>
      <p className="hidden text-[13px] font-medium text-ink-muted sm:block">{formatTodayLong()}</p>
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
// live dispatch eligibility. Every bit of state/logic here is unchanged
// from before this redesign: location is only ever requested once the
// caregiver explicitly taps Go Available, same discipline as SafeTrack
// (components/safe-track.tsx) — never on page load, never silently.
// Only the returned JSX changed: availability and location are now two
// visually distinct cards (availability prominent, location secondary)
// instead of one combined card, per the redesign's own instruction —
// no new state was introduced to do this.
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
      {/* AVAILABILITY — the most prominent section on the page. */}
      <Sheet
        className={`flex flex-col gap-3 ${status.available ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/5" : "border-[var(--color-lavender-border)]"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            {status.available && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)]" />
            )}
            {status.available ? "You're available for care" : "You're currently off duty"}
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
        <p className="text-[13px] text-ink-muted">
          {status.available
            ? "CareLink can send you nearby care requests while you're available."
            : "Go available to start receiving nearby care requests."}
        </p>
        {error && <p className="text-[13px] text-error">{error}</p>}
      </Sheet>

      {/* LOCATION — visually secondary, and only ever framed as tied to
          being Available, never as continuous/background tracking. */}
      <Sheet className="flex flex-col gap-2 border-hairline">
        <div className="flex items-center gap-2">
          <MapPin size={16} className={status.available ? "text-wisteria" : "text-ink-muted"} />
          <p className="text-[13px] font-semibold text-ink">
            Location sharing: {status.available ? "On" : "Off"}
          </p>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Your location is used to find care requests near you while you&apos;re available.
        </p>
        {status.available && status.updatedAt && (
          <p className="text-[11.5px] text-ink-muted">
            Last updated {minutesAgoLabel(status.updatedAt)}
          </p>
        )}
        <Link
          href="/staff/profile"
          className="self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
        >
          Manage
        </Link>
      </Sheet>
    </div>
  );
}

// Requests waiting — the same count already fetched for the request
// list further down the page (no duplicate fetch).
function RequestsStat({ count }: { count: number | null }) {
  return (
    <Sheet className="flex flex-col gap-1.5">
      <Tray size={18} className="text-wisteria" />
      <span className="text-[22px] font-semibold tabular-nums text-ink">{count ?? "…"}</span>
      <span className="text-[12px] text-ink-muted">
        {count === 1 ? "Request waiting" : "Requests waiting"}
      </span>
    </Sheet>
  );
}

// Today's and this-week's real booking counts — one shared fetch of the
// caregiver's own bookings (same GET /api/bookings the Schedule page
// already calls), never fabricated. "Upcoming this week" deliberately
// excludes today's own booking(s) so the two stats never double-count
// the same session.
function ScheduleStats() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));
  }, []);

  const confirmed = bookings?.filter((b) => ["accepted", "paid", "active"].includes(b.status));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const in7Days = weekAhead.toISOString().slice(0, 10);
  const todayCount = confirmed?.filter((b) => b.starts_at.slice(0, 10) === today).length ?? null;
  const upcomingCount =
    confirmed?.filter((b) => {
      const date = b.starts_at.slice(0, 10);
      return date > today && date <= in7Days;
    }).length ?? null;

  return (
    <>
      <Sheet className="flex flex-col gap-1.5">
        <CalendarBlank size={18} className="text-wisteria" />
        <span className="text-[22px] font-semibold tabular-nums text-ink">{todayCount ?? "…"}</span>
        <span className="text-[12px] text-ink-muted">Care scheduled today</span>
      </Sheet>
      <Sheet className="flex flex-col gap-1.5">
        <CalendarCheck size={18} className="text-wisteria" />
        <span className="text-[22px] font-semibold tabular-nums text-ink">
          {upcomingCount ?? "…"}
        </span>
        <span className="text-[12px] text-ink-muted">Upcoming this week</span>
      </Sheet>
    </>
  );
}

// This month's real earnings total — reuses the existing
// GET /api/staff/earnings the Earnings page already calls; nothing new
// on the backend.
function EarningsStat() {
  const [monthTotal, setMonthTotal] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ totals: { week: number; month: number } }>("/api/staff/earnings")
      .then((res) => setMonthTotal(res.totals.month))
      .catch(() => setMonthTotal(null));
  }, []);

  return (
    <Link href="/staff/earnings">
      <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
        <Wallet size={18} className="text-wisteria" />
        <span className="text-[22px] font-semibold tabular-nums text-ink">
          GH₵{monthTotal ?? 0}
        </span>
        <span className="text-[12px] text-ink-muted">Earnings this month</span>
      </Sheet>
    </Link>
  );
}

// "Caregiver profile/readiness" — one of the five things this dashboard
// is built around. A clean icon-in-circle treatment rather than a stock
// photo, since there's no existing caregiver-facing illustration asset
// in this project to reuse honestly.
function ProfileReadinessBanner() {
  return (
    <Sheet className="flex flex-col items-center gap-4 border-[var(--color-lavender-border)] bg-wisteria-tint p-6 text-center sm:flex-row sm:items-center sm:text-left">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sheet text-wisteria shadow-[var(--shadow-card)]">
        <Sparkle size={28} weight="fill" />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-[18px] font-bold font-heading text-ink">
          Stay ready for new opportunities
        </p>
        <p className="text-[13.5px] text-ink-muted">
          Keep your profile updated and be available to receive care requests near you.
        </p>
      </div>
      <LinkButton href="/staff/profile" className="w-full shrink-0 justify-center sm:w-auto">
        View My Profile
      </LinkButton>
    </Sheet>
  );
}

// "Today's care" — real, already-accepted sessions for today, from the
// same real booking data ScheduleStats above computes from, never fake
// placeholder rows.
function TodaysSchedule() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todaysBookings = bookings
    ?.filter(
      (b) =>
        ["accepted", "paid", "active"].includes(b.status) && b.starts_at.slice(0, 10) === today,
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold font-heading text-ink">Today&apos;s Schedule</h2>
        <Link
          href="/staff/schedule"
          className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
        >
          View all
        </Link>
      </div>

      {bookings === null && (
        <div className="flex flex-col gap-3">
          <BookingCardSkeleton />
        </div>
      )}

      {bookings && todaysBookings?.length === 0 && (
        <EmptyState
          icon={CalendarBlank}
          title="No care scheduled today"
          description="Once you accept a request, it will appear here."
        />
      )}

      {todaysBookings && todaysBookings.length > 0 && (
        <div className="flex flex-col gap-3">
          {todaysBookings.map((b) => (
            <Link key={b.id} href={`/staff/schedule/${b.id}`}>
              <Sheet className="flex items-center justify-between gap-4 hover:border-wisteria/50">
                <div>
                  <p className="text-[15px] font-semibold text-ink">
                    {formatTime(b.starts_at)} – {formatTime(b.ends_at)}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {b.address ?? b.careLocationGeneral ?? "General area not available"}
                  </p>
                </div>
                <p className="text-[15px] font-semibold tabular-nums text-ink">
                  GH₵{b.total_amount}
                </p>
              </Sheet>
            </Link>
          ))}
        </div>
      )}
    </section>
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
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <DashboardHeader />

      <GoAvailableControl />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RequestsStat count={bookings?.length ?? null} />
        <ScheduleStats />
        <EarningsStat />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold font-heading text-ink">Care Requests</h2>
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

      <ProfileReadinessBanner />

      <TodaysSchedule />
    </div>
  );
}
