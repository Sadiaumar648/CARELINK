"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Sparkle, Wallet, BellRinging } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestCard, type StaffRequestBooking } from "@/components/staff/request-card";

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  address: string | null;
  careLocationGeneral?: string | null;
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

function formatTimeRange(startsAt: string, endsAt: string): string {
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time(new Date(startsAt))} – ${time(new Date(endsAt))}`;
}

// The page header: greeting (real authenticated name, never hardcoded)
// + supporting text + today's date where space permits. Unchanged.
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

// NEW CARE REQUESTS — the alert a caregiver sees the moment a parent
// picks them. A dispatch offer is a real `bookings` row in 'pending'
// status (same data /staff/requests shows), and the parent's chosen
// caregiver is always offered it first (lib/services/dispatch.ts's
// preferred-caregiver path). Shown here at the very top of Home, with
// the same Accept/Decline actions as the Requests page — a caregiver
// never has to leave Home (or wait for the backup email) to respond.
// Renders nothing at all when there's nothing pending, so Home stays
// quiet the rest of the time.
function NewRequestsAlert({ onChange }: { onChange: () => void }) {
  const [bookings, setBookings] = useState<StaffRequestBooking[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: StaffRequestBooking[] }>("/api/bookings?status=pending")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));
  }, [reloadKey]);

  if (!bookings || bookings.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-wisteria/40 bg-wisteria-tint p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BellRinging size={18} weight="fill" className="text-wisteria" />
        <h2 className="text-[15px] font-bold text-ink">
          {bookings.length === 1 ? "New care request" : `${bookings.length} new care requests`}
        </h2>
      </div>
      <p className="text-[13px] text-ink-muted">
        A family picked you. Accept to confirm — once they pay, your booking is set and you can
        message each other.
      </p>
      <div className="flex flex-col gap-3">
        {bookings.map((b) => (
          <RequestCard
            key={b.id}
            booking={b}
            onRespond={() => {
              setReloadKey((k) => k + 1);
              onChange();
            }}
          />
        ))}
      </div>
    </section>
  );
}

// CareLink's current dispatch rule: an approved, active caregiver is
// automatically eligible for suitable care requests — agency approval,
// caregiver type, schedule/conflicts, and service location are all
// checked automatically by dispatch (lib/services/dispatch.ts), with no
// manual "go available" step required. accepting_bookings (default
// true) is the one thing a caregiver controls directly — pausing it
// stops new requests without pretending they went "offline".
function ReceivingRequestsControl() {
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ acceptingBookings: boolean }>("/api/staff/accepting-bookings")
      .then((res) => setAccepting(res.acceptingBookings))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function toggle() {
    if (accepting === null) return;
    const next = !accepting;
    setBusy(true);
    setError(null);
    apiFetch<{ acceptingBookings: boolean }>("/api/staff/accepting-bookings", {
      method: "PATCH",
      body: { acceptingBookings: next },
    })
      .then((res) => setAccepting(res.acceptingBookings))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  }

  if (accepting === null) return <Skeleton className="h-24 w-full" />;

  return (
    <Sheet
      className={`flex flex-col gap-3 ${accepting ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/5" : "border-[var(--color-lavender-border)]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${accepting ? "bg-[var(--color-success)]" : "bg-ink-muted/40"}`}
            />
            {accepting ? "Receiving requests · On" : "Receiving requests · Paused"}
          </span>
          <h2 className="text-[16px] font-semibold text-ink">
            {accepting ? "You're eligible for new care requests" : "New requests are paused"}
          </h2>
        </div>
        <Button size="lg" variant="secondary" onClick={toggle} disabled={busy}>
          {busy ? "Updating…" : accepting ? "Pause new requests" : "Resume new requests"}
        </Button>
      </div>
      <p className="text-[13px] text-ink-muted">
        {accepting
          ? "CareLink automatically sends you suitable requests based on your type, schedule, and location."
          : "You won't receive new care requests until you resume."}
      </p>
      {error && <p className="text-[13px] text-error">{error}</p>}
    </Sheet>
  );
}

// TODAY'S CARE — real confirmed/upcoming/in-progress bookings starting
// today, from the caregiver's own GET /api/bookings (same data the
// Schedule page uses).
function TodaysCareSection() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const todays = res.bookings.filter((b) => {
          if (!["accepted", "paid", "active"].includes(b.status)) return false;
          const startsAt = new Date(b.starts_at);
          return startsAt >= today && startsAt < tomorrow;
        });
        setBookings(todays);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-semibold text-ink">Today&apos;s Care</h2>
      {error && <p className="text-[13px] text-error">{error}</p>}
      {!error && bookings === null && <Skeleton className="h-20 w-full" />}
      {!error && bookings?.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title="No care scheduled for today"
          description="Confirmed bookings starting today will show up here."
        />
      )}
      {!error && bookings && bookings.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {bookings.map((b) => (
            <Link key={b.id} href={`/staff/schedule/${b.id}`}>
              <Sheet className="flex items-center justify-between gap-3 hover:border-wisteria/50">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[14px] font-semibold text-ink">
                    {formatTimeRange(b.starts_at, b.ends_at)}
                  </p>
                  <p className="text-[12.5px] text-ink-muted">
                    {b.address ?? b.careLocationGeneral ?? "Address shared with confirmed bookings"}
                  </p>
                </div>
                <span className="rounded-full bg-wisteria-tint px-2.5 py-1 text-[11.5px] font-semibold capitalize text-wisteria-pressed">
                  {b.status}
                </span>
              </Sheet>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// UPCOMING — real, already-accepted sessions starting this week. A
// different granularity from Today's Care above; the full schedule
// still has its own page.
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
        <span className="text-[11.5px] font-semibold text-wisteria">View schedule</span>
      </Sheet>
    </Link>
  );
}

// EARNINGS — this month's real total, reusing the existing
// GET /api/staff/earnings the Earnings page already calls. Unchanged.
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
        <span className="text-[11.5px] font-semibold text-wisteria">View earnings</span>
      </Sheet>
    </Link>
  );
}

// "Caregiver profile/readiness" — unchanged.
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

// Care Requests (the pending-offers list) was removed from Home per
// explicit request — /staff/requests is still the real, unchanged place
// to see and act on them. Location Sharing/base location/service area
// moved to Settings (components/staff-location-settings.tsx) — a
// caregiver updates those there whenever they move, not from Home.
export default function StaffHomePage() {
  // Bumped when a caregiver accepts/declines a request from the alert
  // above, so the sections that depend on booking state (Today's Care,
  // Upcoming) re-fetch instead of showing stale counts.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <DashboardHeader />

      <NewRequestsAlert onChange={() => setRefreshKey((k) => k + 1)} />

      <ReceivingRequestsControl />

      <TodaysCareSection key={`today-${refreshKey}`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UpcomingStat key={`upcoming-${refreshKey}`} />
        <EarningsStat />
      </div>

      <ProfileReadinessBanner />
    </div>
  );
}
