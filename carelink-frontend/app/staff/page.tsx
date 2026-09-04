"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, MapPin, Sparkle, Tray, Wallet } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { minutesAgoLabel } from "@/lib/relative-time";

type Booking = {
  id: string;
  starts_at: string;
  status: string;
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTodayLong(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
// Only the returned JSX changed: availability and location are two
// visually distinct cards (availability prominent, location secondary)
// — no new state was introduced to do this.
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

// REQUESTS — a real count of pending offers, no fabricated number. The
// full list with Accept/Decline lives on its own /staff/requests page
// (Section 11 of the redesign); Home only ever shows the count.
function RequestsStat() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings?status=pending")
      .then((res) => setCount(res.bookings.length))
      .catch(() => setCount(null));
  }, []);

  return (
    <Link href="/staff/requests">
      <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
        <Tray size={18} className="text-wisteria" />
        <span className="text-[22px] font-semibold tabular-nums text-ink">{count ?? "…"}</span>
        <span className="text-[12px] font-semibold text-ink">Requests waiting</span>
        <span className="text-[11.5px] text-ink-muted">
          New care requests will appear here when available.
        </span>
      </Sheet>
    </Link>
  );
}

// UPCOMING — real, already-accepted sessions starting this week, from
// the caregiver's own bookings (same GET /api/bookings the Schedule
// page already calls). Deliberately excludes today alone; the full
// schedule already has its own dedicated page (Section 12).
function UpcomingStat() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => {
        const now = new Date();
        const in7Days = new Date(now);
        in7Days.setDate(in7Days.getDate() + 7);
        const upcoming = res.bookings.filter((b) => {
          if (!["accepted", "paid", "active"].includes(b.status)) return false;
          const startsAt = new Date(b.starts_at);
          return startsAt >= now && startsAt <= in7Days;
        });
        setCount(upcoming.length);
      })
      .catch(() => setCount(null));
  }, []);

  return (
    <Link href="/staff/schedule">
      <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
        <CalendarCheck size={18} className="text-wisteria" />
        <span className="text-[22px] font-semibold tabular-nums text-ink">{count ?? "…"}</span>
        <span className="text-[12px] font-semibold text-ink">Upcoming this week</span>
        <span className="text-[11.5px] text-ink-muted">
          Care sessions you&apos;ve accepted for this week.
        </span>
      </Sheet>
    </Link>
  );
}

// EARNINGS — this month's real total, reusing the existing
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
        <span className="text-[12px] font-semibold text-ink">Earnings this month</span>
        <span className="text-[11.5px] font-semibold text-wisteria">View earnings →</span>
      </Sheet>
    </Link>
  );
}

// "Caregiver profile/readiness" — a clean icon-in-circle treatment
// rather than a stock photo, since there's no existing caregiver-facing
// illustration asset in this project to reuse honestly.
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

export default function StaffHomePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <DashboardHeader />

      <GoAvailableControl />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RequestsStat />
        <UpcomingStat />
        <EarningsStat />
      </div>

      <ProfileReadinessBanner />
    </div>
  );
}
