"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Sparkle, Wallet } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionActionButton } from "@/components/staff/session-action-button";
import { WardCareProfileList, type WardBrief } from "@/components/ward-care-profile";

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  address: string | null;
  careLocationGeneral?: string | null;
  status: string;
};
type EnrichedBooking = Booking & { wards: WardBrief[] };

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

// One Today's Care row. Its own "View"/"Hide" toggle next to the
// child's name reveals their care profile inline, right here — the
// caregiver never has to leave Home to check on the child they're
// caring for.
function TodaysCareRow({
  booking: b,
  onChanged,
}: {
  booking: EnrichedBooking;
  onChanged: () => void;
}) {
  const [wardsOpen, setWardsOpen] = useState(false);

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/staff/schedule/${b.id}`}
          className="flex flex-col gap-0.5 hover:text-wisteria"
        >
          <p className="text-[14px] font-semibold text-ink">
            {formatTimeRange(b.starts_at, b.ends_at)}
          </p>
          <p className="text-[12.5px] text-ink-muted">
            {b.address ?? b.careLocationGeneral ?? "Address shared with confirmed bookings"}
          </p>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* Start/End Session lives right here on Home, not only on the
              booking detail page — the caregiver's own action, same
              mandatory-location gate either way. */}
          {(b.status === "paid" || b.status === "active") && (
            <SessionActionButton bookingId={b.id} status={b.status} isToday onChanged={onChanged} />
          )}
          {b.status === "accepted" && (
            <span className="rounded-full bg-wisteria-tint px-2.5 py-1 text-[11.5px] font-semibold capitalize text-wisteria-pressed">
              {b.status}
            </span>
          )}
        </div>
      </div>
      {b.wards.length > 0 && (
        <div className="flex items-center gap-2 border-t border-hairline pt-3">
          <p className="text-[12.5px] text-ink-muted">
            Caring for {b.wards.map((w) => w.display_name).join(" & ")}
          </p>
          <button
            type="button"
            onClick={() => setWardsOpen((o) => !o)}
            aria-expanded={wardsOpen}
            className="text-[12px] font-semibold text-wisteria hover:text-wisteria-hover"
          >
            {wardsOpen ? "Hide" : "View"}
          </button>
        </div>
      )}
      {wardsOpen && b.wards.length > 0 && <WardCareProfileList wards={b.wards} />}
    </Sheet>
  );
}

// TODAY'S CARE — real confirmed/upcoming/in-progress bookings starting
// today, from the caregiver's own GET /api/bookings (same data the
// Schedule page uses), each enriched with its child's/children's own
// care profile.
function TodaysCareSection() {
  const [bookings, setBookings] = useState<EnrichedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
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
        return Promise.all(
          todays.map(async (b) => ({
            ...b,
            wards: await apiFetch<{ wards: WardBrief[] | null; ward: WardBrief | null }>(
              `/api/bookings/${b.id}`,
            )
              .then((r) => r.wards ?? (r.ward ? [r.ward] : []))
              .catch(() => [] as WardBrief[]),
          })),
        );
      })
      .then((enriched) => setBookings(enriched))
      .catch((err) => setError(errorMessage(err)));
  }

  // onChanged={load} below (from Start/End Session) re-fetches directly;
  // this effect only needs to run once, on mount — same as before.
  useEffect(load, []);

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
            <TodaysCareRow key={b.id} booking={b} onChanged={load} />
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

// CareLink assigns care sessions directly — there's no pending-offer
// queue for a caregiver to respond to any more, so there's nothing left
// on Home to alert on or act from. Location Sharing/base location/
// service area live in Settings (components/staff-location-settings.tsx)
// — a caregiver updates those there whenever they move, not from Home.
export default function StaffHomePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <DashboardHeader />

      <ReceivingRequestsControl />

      <TodaysCareSection />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UpcomingStat />
        <EarningsStat />
      </div>

      <ProfileReadinessBanner />
    </div>
  );
}
