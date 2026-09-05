"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  ChatCircleDots,
  ClockCounterClockwise,
  Flag,
  MagnifyingGlass,
  UserPlus,
  UsersFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

// CareLink is agency-controlled, not an open caregiver marketplace — a
// caregiver reaching this roster was onboarded and approved by the
// agency itself, so this dashboard is built around real operations
// (who's available, what's waiting, what's happening), never a
// verification-queue KPI. Every figure below comes from a real,
// already-existing (or minimally, additively extended — see the
// individual routes) backend source; nothing here is hardcoded.

type Overview = {
  bookings: { byStatus: Record<string, number> };
  revenue: { total: number };
  availableCaregiversNow: number;
  careRequestsSearching: number;
  openReports: number;
};

type RosterEntry = {
  id: string;
  fullName: string;
  caregiverType: "nanny" | "babysitter" | null;
  dispatchAvailable: boolean;
  primaryArea: string | null;
};

type CareRequestRow = {
  id: string;
  caregiverType: "nanny" | "babysitter";
  status: string;
  createdAt: string;
};

type ActivityRow = {
  bookingId: string;
  reference: string | null;
  label: string;
  occurredAt: string;
};

const STATUS_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  Searching: "info",
  "Caregiver Offer": "info",
  "Awaiting Payment": "neutral",
  "Confirmed / Paid": "positive",
  "In Progress": "positive",
  Completed: "positive",
  Cancelled: "attention",
  "Payment Expired": "attention",
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

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Kpi({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof UsersThree;
  label: string;
  value: string;
}) {
  return (
    <Link href={href}>
      <Sheet className="flex h-full flex-col gap-1.5 hover:border-wisteria/50">
        <Icon size={18} className="text-wisteria" />
        <span className="text-[24px] font-semibold tabular-nums text-ink">{value}</span>
        <span className="text-[12px] text-ink-muted">{label}</span>
      </Sheet>
    </Link>
  );
}

function AttentionCard({
  href,
  label,
  description,
  count,
}: {
  href: string;
  label: string;
  description: string;
  count: number | null;
}) {
  return (
    <Link href={href}>
      <Sheet className="flex flex-col gap-1.5 hover:border-wisteria/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-ink">{label}</span>
          <span className="text-[20px] font-semibold tabular-nums text-wisteria">
            {count === null ? "…" : count}
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-muted">{description}</p>
      </Sheet>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UsersThree;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-[14px] border border-hairline bg-sheet p-4 text-center hover:border-wisteria/50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
        <Icon size={19} />
      </span>
      <span className="text-[12.5px] font-semibold text-ink">{label}</span>
    </Link>
  );
}

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? "Admin").split(
    " ",
  )[0];

  const [overview, setOverview] = useState<Overview | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [careRequests, setCareRequests] = useState<CareRequestRow[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Month-to-date, consistent across bookings and revenue — Revenue
    // is specifically asked to be "current-month"; using the same
    // window for the booking-count cards keeps every figure on this
    // page describing the same period rather than mixing two.
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const params = `?from=${encodeURIComponent(monthStart.toISOString())}`;

    apiFetch<Overview>(`/api/admin/overview${params}`)
      .then(setOverview)
      .catch((err) => setError(errorMessage(err)));

    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => setRoster(res.roster))
      .catch(() => setRoster([]));

    apiFetch<{ careRequests: CareRequestRow[] }>("/api/admin/care-requests")
      .then((res) => setCareRequests(res.careRequests))
      .catch(() => setCareRequests([]));

    apiFetch<{ activity: ActivityRow[] }>("/api/admin/activity")
      .then((res) => setActivity(res.activity))
      .catch(() => setActivity([]));
  }, [retryKey]);

  const byStatus = overview?.bookings.byStatus ?? {};
  const availableNow = (roster ?? []).filter((r) => r.dispatchAvailable);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold font-heading text-ink">
            {greeting()}, {firstName} 👋
          </h1>
          <p className="text-[14px] text-ink-muted">
            Here&apos;s what&apos;s happening across CareLink today.
          </p>
        </div>
        <p className="hidden text-[13px] font-medium text-ink-muted sm:block">
          {formatTodayLong()}
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi
              href="/admin/roster"
              icon={UsersThree}
              label="Caregivers"
              value={roster === null ? "…" : String(roster.length)}
            />
            <Kpi
              href="/admin/roster"
              icon={UsersThree}
              label="Available Now"
              value={overview === null ? "…" : String(overview.availableCaregiversNow)}
            />
            <Kpi
              href="#recent-care-requests"
              icon={MagnifyingGlass}
              label="Care Requests"
              value={overview === null ? "…" : String(overview.careRequestsSearching)}
            />
            <Kpi
              href="/admin/bookings?status=active"
              icon={ClockCounterClockwise}
              label="Active Bookings"
              value={overview === null ? "…" : String(byStatus.active ?? 0)}
            />
            <Kpi
              href="/admin/bookings?status=completed"
              icon={CalendarCheck}
              label="Completed Bookings"
              value={overview === null ? "…" : String(byStatus.completed ?? 0)}
            />
            <Kpi
              href="/admin/bookings"
              icon={Wallet}
              label="Revenue"
              value={overview === null ? "…" : `GH₵${overview.revenue.total}`}
            />
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold text-ink">Attention Required</h2>
              <p className="text-[13px] text-ink-muted">Items that may need your attention.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AttentionCard
                href="/admin/bookings?status=accepted"
                label="Payment Awaiting"
                description="Caregivers have accepted requests but parent payment has not yet been completed."
                count={overview === null ? null : (byStatus.accepted ?? 0)}
              />
              <AttentionCard
                href="/admin/reports"
                label="Open Reports"
                description="Reports requiring administrator review."
                count={overview === null ? null : overview.openReports}
              />
              <AttentionCard
                href="#recent-care-requests"
                label="Care Requests Searching"
                description="Requests currently going through the caregiver dispatch process."
                count={overview === null ? null : overview.careRequestsSearching}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <QuickAction
                href="#recent-care-requests"
                icon={MagnifyingGlass}
                label="View Care Requests"
              />
              <QuickAction href="/admin/bookings" icon={CalendarCheck} label="Manage Bookings" />
              <QuickAction href="/admin/roster" icon={UserPlus} label="Onboard Caregiver" />
              <QuickAction href="/admin/roster" icon={UsersThree} label="Manage Caregivers" />
              <QuickAction href="/admin/users" icon={UsersFour} label="Manage Users" />
              <QuickAction href="/admin/reports" icon={Flag} label="View Reports" />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section id="recent-care-requests" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-[15px] font-semibold text-ink">Recent Care Requests</h2>
                  <p className="text-[12.5px] text-ink-muted">
                    Latest care requests in the system.
                  </p>
                </div>
                <Link
                  href="/admin/bookings"
                  className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
                >
                  View all
                </Link>
              </div>

              {careRequests === null && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {careRequests?.length === 0 && (
                <EmptyState
                  icon={MagnifyingGlass}
                  title="No recent care requests"
                  description="New requests will appear here when families request care."
                />
              )}

              {careRequests && careRequests.length > 0 && (
                <div className="overflow-x-auto rounded-[16px] border border-hairline bg-sheet">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                        <th className="px-4 py-2.5 font-semibold">Request</th>
                        <th className="px-4 py-2.5 font-semibold">Care Type</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {careRequests.map((cr) => (
                        <tr key={cr.id} className="border-b border-hairline last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-ink-muted">
                            {cr.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2.5 text-ink">
                            {CAREGIVER_TYPE_LABEL[cr.caregiverType]}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge
                              label={cr.status}
                              tone={STATUS_TONE[cr.status] ?? "neutral"}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                            {timeAgo(cr.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-[15px] font-semibold text-ink">Caregivers Available Now</h2>
                  <p className="text-[12.5px] text-ink-muted">
                    Caregivers currently available for care.
                  </p>
                </div>
                <Link
                  href="/admin/roster"
                  className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
                >
                  View all
                </Link>
              </div>

              {roster === null && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {roster && availableNow.length === 0 && (
                <EmptyState
                  icon={UsersThree}
                  title="No caregivers available right now"
                  description="Caregivers appear here once they choose Go Available on their Home dashboard."
                />
              )}

              {roster && availableNow.length > 0 && (
                <div className="flex flex-col gap-2">
                  {availableNow.slice(0, 8).map((c) => (
                    <Sheet key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-[13.5px] font-medium text-ink">{c.fullName}</span>
                      <span className="text-[12.5px] text-ink-muted">
                        {c.caregiverType ? CAREGIVER_TYPE_LABEL[c.caregiverType] : "—"}
                        {c.primaryArea ? ` · ${c.primaryArea}` : ""}
                      </span>
                    </Sheet>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold text-ink">Recent Activity</h2>
              <p className="text-[13px] text-ink-muted">Latest updates across CareLink.</p>
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
        </>
      )}
    </div>
  );
}
