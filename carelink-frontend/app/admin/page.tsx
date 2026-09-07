"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  ChatCircleDots,
  ClockCounterClockwise,
  Flag,
  MagnifyingGlass,
  ShieldWarning,
  Star,
  UserPlus,
  UsersFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// Admin Home, redesigned as an agency operations command centre rather
// than a stats dashboard. Revenue and the old top metric-card row are
// gone entirely (financial figures belong in Payments/Finance, which
// doesn't have a dedicated admin page yet — not built here, see the
// report). Every section below reads real, already-existing backend
// data: GET /api/admin/bookings (unfiltered, the same route
// /admin/bookings already uses) powers both Live Care and Today's
// Schedule; GET /api/admin/roster supplies caregiver names/types for
// those rows; GET /api/admin/overview and GET /api/admin/verifications
// supply Needs Attention's real counts; GET /api/admin/activity is the
// existing Recent Activity feed, unchanged. Nothing here is fabricated
// or hardcoded.
//
// One deliberate, flagged gap: "Generate Caregiver Onboarding Link"
// describes a bulk self-service registration link CareLink's backend
// does not have today (the real invitation mechanism is one
// admin-issued code per caregiver, via the existing /admin/roster
// invite flow) — per this task's own instruction not to invent that
// backend, the action routes to the existing roster/invite flow
// instead of a link generator that doesn't exist. See the report for
// the fuller note on how this also touches the earlier "agency-
// controlled, no caregiver self-verification" decision.

type Overview = {
  bookings: { byStatus: Record<string, number> };
  openReports: number;
  careRequestsSearching: number;
};

type RosterEntry = {
  id: string;
  staffProfileId: string | null;
  fullName: string;
  caregiverType: "nanny" | "babysitter" | null;
};

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
  session_started_at: string | null;
  status: string;
};

type ActivityRow = {
  bookingId: string;
  reference: string | null;
  label: string;
  occurredAt: string;
};

type VerificationSubmission = { users: { role: string } | null };

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

const SCHEDULE_STATUS_LABEL: Record<string, string> = {
  paid: "Upcoming",
  active: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const SCHEDULE_STATUS_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  paid: "info",
  active: "positive",
  completed: "positive",
  cancelled: "attention",
};

function formatTodayLong(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: typeof UsersThree;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-[16px] border border-hairline bg-sheet p-5 hover:border-wisteria/50 hover:shadow-[var(--shadow-card-hover)]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
        <Icon size={21} />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[14.5px] font-semibold text-ink">{label}</span>
        <span className="text-[12.5px] leading-relaxed text-ink-muted">{description}</span>
      </div>
    </Link>
  );
}

function AttentionItem({
  href,
  icon: Icon,
  count,
  description,
}: {
  href: string;
  icon: typeof UsersThree;
  count: number;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[12px] border border-hairline bg-sheet px-4 py-3 hover:border-wisteria/50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
        <Icon size={17} />
      </span>
      <span className="flex-1 text-[13.5px] text-ink">{description}</span>
      <span className="text-[19px] font-bold tabular-nums text-ink">{count}</span>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pendingCaregiverApps, setPendingCaregiverApps] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<Overview>("/api/admin/overview")
      .then((res) => {
        setError(null);
        setOverview(res);
      })
      .catch((err) => setError(errorMessage(err)));

    apiFetch<{ submissions: VerificationSubmission[] }>("/api/admin/verifications?status=pending")
      .then((res) =>
        setPendingCaregiverApps(res.submissions.filter((s) => s.users?.role === "staff").length),
      )
      .catch(() => setPendingCaregiverApps(0));

    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => setRoster(res.roster))
      .catch(() => setRoster([]));

    apiFetch<{ bookings: Booking[] }>("/api/admin/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));

    apiFetch<{ activity: ActivityRow[] }>("/api/admin/activity")
      .then((res) => setActivity(res.activity))
      .catch(() => setActivity([]));
  }, [retryKey]);

  const rosterByStaffProfileId = new Map((roster ?? []).map((r) => [r.staffProfileId, r]));
  const today = new Date().toISOString().slice(0, 10);

  const liveCare = (bookings ?? []).filter((b) => b.status === "active");
  const todaysSchedule = (bookings ?? [])
    .filter(
      (b) =>
        ["paid", "active", "completed", "cancelled"].includes(b.status) &&
        b.starts_at.slice(0, 10) === today,
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  function caregiverName(staffProfileId: string): string {
    return rosterByStaffProfileId.get(staffProfileId)?.fullName ?? "Unknown caregiver";
  }
  function caregiverTypeLabel(staffProfileId: string): string {
    const type = rosterByStaffProfileId.get(staffProfileId)?.caregiverType;
    return type ? CAREGIVER_TYPE_LABEL[type] : "—";
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold font-heading text-ink">Good morning, Admin 👋</h1>
          <p className="text-[14px] text-ink-muted">Here&apos;s what you need to know today.</p>
        </div>
        <p className="hidden text-[13px] font-medium text-ink-muted sm:block">
          {formatTodayLong()}
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && (
        <>
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold text-ink">Quick Actions</h2>
              <p className="text-[13px] text-ink-muted">Common tasks for managing your agency.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                href="/admin/roster"
                icon={UserPlus}
                label="Generate Caregiver Onboarding Link"
                description="Create a secure registration link for your agency caregivers."
              />
              <QuickAction
                href="/admin/roster"
                icon={UsersThree}
                label="Manage Caregivers"
                description="View and manage all agency caregivers."
              />
              <QuickAction
                href="/admin/users"
                icon={UsersFour}
                label="Manage Families"
                description="View and manage parent accounts."
              />
              <QuickAction
                href="/admin/bookings"
                icon={CalendarCheck}
                label="View Bookings"
                description="See bookings by status and date."
              />
              <QuickAction
                href="/admin/reviews"
                icon={Star}
                label="View Reviews"
                description="Monitor reviews and feedback."
              />
              <QuickAction
                href="/admin/reports"
                icon={Flag}
                label="View Reports"
                description="See platform activity and insights."
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Live Care</h2>
                <p className="text-[12.5px] text-ink-muted">Care sessions currently in progress.</p>
              </div>

              {bookings === null && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {bookings && liveCare.length === 0 && (
                <EmptyState
                  icon={ClockCounterClockwise}
                  title="No care sessions in progress"
                  description="Active care sessions will appear here when care begins."
                />
              )}

              {bookings && liveCare.length > 0 && (
                <div className="overflow-x-auto rounded-[16px] border border-hairline bg-sheet">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Caregiver</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Care Type</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Booking</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Started</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">
                          Expected End
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Status</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveCare.map((b) => (
                        <tr key={b.id} className="border-b border-hairline last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink">
                            {caregiverName(b.staff_profile_id)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                            {caregiverTypeLabel(b.staff_profile_id)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-ink-muted">
                            {b.reference}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                            {formatTime(b.session_started_at ?? b.starts_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                            {formatTime(b.ends_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <StatusBadge label="In Progress" tone="positive" />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <Link
                              href="/admin/bookings?status=active"
                              className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Link
                href="/admin/bookings?status=active"
                className="self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
              >
                View all live care
              </Link>
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Today&apos;s Schedule</h2>
                <p className="text-[12.5px] text-ink-muted">
                  Confirmed and upcoming care sessions for today.
                </p>
              </div>

              {bookings === null && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {bookings && todaysSchedule.length === 0 && (
                <EmptyState
                  icon={CalendarCheck}
                  title="Nothing scheduled for today"
                  description="Today's confirmed care sessions will appear here."
                />
              )}

              {bookings && todaysSchedule.length > 0 && (
                <div className="flex flex-col gap-2">
                  {todaysSchedule.slice(0, 8).map((b) => (
                    <Sheet key={b.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13.5px] font-medium text-ink">
                          {formatTime(b.starts_at)} · {caregiverName(b.staff_profile_id)}
                        </span>
                        <span className="text-[12px] text-ink-muted">
                          {caregiverTypeLabel(b.staff_profile_id)} · {b.reference}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          label={SCHEDULE_STATUS_LABEL[b.status] ?? b.status}
                          tone={SCHEDULE_STATUS_TONE[b.status] ?? "neutral"}
                        />
                        <Link
                          href={`/admin/bookings?status=${b.status}`}
                          className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
                        >
                          View Details
                        </Link>
                      </div>
                    </Sheet>
                  ))}
                </div>
              )}

              <Link
                href="/admin/bookings"
                className="self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
              >
                View full schedule
              </Link>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Needs Attention</h2>
                <p className="text-[12.5px] text-ink-muted">Items that require your action.</p>
              </div>

              {(overview === null || pendingCaregiverApps === null) && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {overview !== null && pendingCaregiverApps !== null && (
                <div className="flex flex-col gap-2">
                  <AttentionItem
                    href="/admin/verifications"
                    icon={ShieldWarning}
                    count={pendingCaregiverApps}
                    description="Caregiver applications awaiting review"
                  />
                  <AttentionItem
                    href="/admin/reports"
                    icon={Flag}
                    count={overview.openReports}
                    description="Caregiver reports require investigation"
                  />
                  <AttentionItem
                    href="/admin/care-requests"
                    icon={MagnifyingGlass}
                    count={overview.careRequestsSearching}
                    description="Care requests currently searching"
                  />
                  <AttentionItem
                    href="/admin/bookings?status=accepted"
                    icon={Wallet}
                    count={overview.bookings.byStatus.accepted ?? 0}
                    description="Payments awaiting action"
                  />
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Recent Activity</h2>
                <p className="text-[12.5px] text-ink-muted">Latest updates on the platform.</p>
              </div>

              {activity === null && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {activity?.length === 0 && (
                <EmptyState icon={ChatCircleDots} title="No recent activity" />
              )}

              {activity && activity.length > 0 && (
                <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[16px] border border-hairline bg-sheet">
                  {activity.map((a, i) => (
                    <div
                      key={`${a.bookingId}-${i}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]"
                    >
                      <span className="text-ink">
                        {a.label}
                        {a.reference && <span className="text-ink-muted"> · {a.reference}</span>}
                      </span>
                      <span className="whitespace-nowrap text-[12px] text-ink-muted">
                        {timeAgo(a.occurredAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
