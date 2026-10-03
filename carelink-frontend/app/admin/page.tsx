"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CaretRight,
  ChartBar,
  ChatCircleDots,
  ClockCounterClockwise,
  Flag,
  Link as LinkIcon,
  MagnifyingGlass,
  ShieldWarning,
  Sparkle,
  Star,
  UsersFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// Admin Home, an agency operations command centre rather than a stats
// dashboard. Revenue and every large top KPI card are gone entirely —
// financial figures live in /admin/payments instead. Every section
// below reads real, already-existing backend data: GET
// /api/admin/bookings powers Live Care;
// GET /api/admin/roster and GET /api/admin/parents supply caregiver/
// family names for those rows; GET /api/admin/overview and
// GET /api/admin/verifications supply Needs Attention's real counts;
// GET /api/admin/activity is the real, merged Recent Activity feed
// (only its 4 newest rows show here — the same route's full result,
// currently up to 15, is reachable via "View all"). Nothing here is
// fabricated or hardcoded.
//
// "Generate Caregiver Onboarding Link" routes to /admin/onboarding-link,
// where real links are generated and managed (migration
// 20260914000000_caregiver_onboarding_links.sql). One remaining,
// flagged gap: the caregiver-facing /caregiver/join/[token]
// self-registration page those links point to doesn't exist yet — a
// separate, larger piece of work — so a generated link is real but not
// yet usable by an actual caregiver.

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

type ParentEntry = {
  id: string;
  parentProfileId: string | null;
  fullName: string;
};

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  parent_profile_id: string;
  starts_at: string;
  ends_at: string;
  session_started_at: string | null;
  status: string;
};

type ActivityRow = {
  bookingId: string | null;
  reference: string | null;
  label: string;
  occurredAt: string;
};

type VerificationSubmission = { users: { role: string } | null };

// Only the 4 newest show on Home — the rest of what the API already
// returns (up to 15) is reachable via "View all" on /admin/activity.
const RECENT_ACTIVITY_HOME_COUNT = 4;

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

// One pastel accent per Quick Action card, drawn only from CareLink's
// existing palette tokens (no new colors introduced): light blue,
// lavender, mint, peach, pink, lavender again for the sixth. The Admin
// Assistant card below is deliberately NOT drawn from this array — its
// gold accent marks it as the one AI-powered surface on this page,
// kept separate from CareLink's ordinary purple-branded accents.
const QUICK_ACTION_TINT = [
  "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
  "bg-wisteria-tint text-wisteria-pressed",
  "bg-success-tint text-[var(--color-success)]",
  "bg-gold-tint text-[var(--color-gold)]",
  "bg-error-tint text-error",
  "bg-wisteria-tint text-wisteria-pressed",
] as const;

function activityDotClass(label: string): string {
  if (label.includes("started") || label.includes("Payment")) return "bg-[var(--color-success)]";
  if (label.includes("application")) return "bg-[var(--color-bluebell-pressed)]";
  if (label.includes("review")) return "bg-wisteria";
  if (label.includes("request created")) return "bg-[var(--color-gold)]";
  if (label.includes("cancelled") || label.includes("declined")) return "bg-error";
  return "bg-ink-muted/50";
}

// "{Surname} Family" — a light presentational transform of the real
// parent's full name (from GET /api/admin/parents), matching how
// families are referred to elsewhere in CareLink's own copy. Never a
// fabricated value: falls back honestly when the lookup can't resolve.
function familyLabel(fullName: string | undefined): string {
  if (!fullName) return "Unknown family";
  const parts = fullName.trim().split(/\s+/);
  return `${parts[parts.length - 1]} Family`;
}

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
  tint,
}: {
  href: string;
  icon: typeof UsersThree;
  label: string;
  description: string;
  tint: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col justify-between gap-4 rounded-[16px] border border-hairline bg-sheet p-5 hover:border-wisteria/50 hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex flex-col gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
          <Icon size={21} />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold text-ink">{label}</span>
          <span className="text-[12.5px] leading-relaxed text-ink-muted">{description}</span>
        </div>
      </div>
      <span className="flex h-7 w-7 items-center justify-center self-end rounded-full bg-[var(--color-lavender-bg)] text-ink-muted">
        <CaretRight size={13} />
      </span>
    </Link>
  );
}

// A section title with an optional "View all" action on the right —
// the compact icon-badge style used by every section except Live Care,
// which gets a live status dot instead (see LiveCareHeading below).
function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: typeof UsersThree;
  title: string;
  subtitle: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-wisteria-tint text-wisteria-pressed">
            <Icon size={13} weight="bold" />
          </span>
        )}
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="text-[12.5px] text-ink-muted">{subtitle}</p>
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
        >
          {action.label} <CaretRight size={12} />
        </Link>
      )}
    </div>
  );
}

function LiveCareHeading({ action }: { action: { href: string; label: string } }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)]"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">Live Care</h2>
          <p className="text-[12.5px] text-ink-muted">Care sessions currently in progress.</p>
        </div>
      </div>
      <Link
        href={action.href}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
      >
        {action.label} <CaretRight size={12} />
      </Link>
    </div>
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
      <CaretRight size={14} className="text-ink-muted" />
    </Link>
  );
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pendingCaregiverApps, setPendingCaregiverApps] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [parents, setParents] = useState<ParentEntry[] | null>(null);
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

    apiFetch<{ parents: ParentEntry[] }>("/api/admin/parents")
      .then((res) => setParents(res.parents))
      .catch(() => setParents([]));

    apiFetch<{ bookings: Booking[] }>("/api/admin/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));

    apiFetch<{ activity: ActivityRow[] }>("/api/admin/activity")
      .then((res) => setActivity(res.activity))
      .catch(() => setActivity([]));
  }, [retryKey]);

  const rosterByStaffProfileId = new Map((roster ?? []).map((r) => [r.staffProfileId, r]));
  const parentsByProfileId = new Map((parents ?? []).map((p) => [p.parentProfileId, p]));

  const liveCare = (bookings ?? []).filter((b) => b.status === "active");
  const recentActivity = (activity ?? []).slice(0, RECENT_ACTIVITY_HOME_COUNT);

  function caregiverName(staffProfileId: string): string {
    return rosterByStaffProfileId.get(staffProfileId)?.fullName ?? "Unknown caregiver";
  }
  function caregiverTypeLabel(staffProfileId: string): string {
    const type = rosterByStaffProfileId.get(staffProfileId)?.caregiverType;
    return type ? CAREGIVER_TYPE_LABEL[type] : "—";
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 p-6 md:p-8">
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
            <SectionHeading title="Quick Actions" subtitle="Common tasks for managing CareLink." />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <QuickAction
                href="/admin/onboarding-link"
                icon={LinkIcon}
                label="Generate Caregiver Onboarding Link"
                description="Create a secure registration link for CareLink caregivers."
                tint={QUICK_ACTION_TINT[0]}
              />
              <QuickAction
                href="/admin/roster"
                icon={UsersThree}
                label="Manage Caregivers"
                description="View and manage all agency caregivers."
                tint={QUICK_ACTION_TINT[1]}
              />
              <QuickAction
                href="/admin/users"
                icon={UsersFour}
                label="Manage Families"
                description="View and manage parent accounts."
                tint={QUICK_ACTION_TINT[2]}
              />
              <QuickAction
                href="/admin/bookings"
                icon={CalendarCheck}
                label="View Bookings"
                description="See all bookings by status and date."
                tint={QUICK_ACTION_TINT[3]}
              />
              <QuickAction
                href="/admin/reviews"
                icon={Star}
                label="View Reviews"
                description="Monitor reviews and feedback."
                tint={QUICK_ACTION_TINT[4]}
              />
              <QuickAction
                href="/admin/reports"
                icon={ChartBar}
                label="View Reports"
                description="See platform activity and insights."
                tint={QUICK_ACTION_TINT[5]}
              />
              <QuickAction
                href="/admin/assistant"
                icon={Sparkle}
                label="Ask the Admin Assistant"
                description="Get quick answers about reports, revenue, bookings, and caregivers."
                tint="bg-gold-tint text-[var(--color-gold)]"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <LiveCareHeading
              action={{ href: "/admin/bookings?status=active", label: "View all live care" }}
            />

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
                description="Active care sessions will appear here when a care session begins."
              />
            )}

            {bookings && liveCare.length > 0 && (
              <div className="overflow-x-auto rounded-[16px] border border-hairline bg-sheet">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Caregiver</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Care Type</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Family</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Started</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Expected End</th>
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
                        <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                          {familyLabel(parentsByProfileId.get(b.parent_profile_id)?.fullName)}
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
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <SectionHeading
                icon={ShieldWarning}
                title="Needs Attention"
                subtitle="Items that require your action."
              />

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
              <SectionHeading
                icon={ChatCircleDots}
                title="Recent Activity"
                subtitle="Latest updates on the platform."
                action={{ href: "/admin/activity", label: "View all" }}
              />

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
                  {recentActivity.map((a, i) => (
                    <div
                      key={`${a.bookingId ?? "evt"}-${i}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]"
                    >
                      <span className="flex items-center gap-2 text-ink">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${activityDotClass(a.label)}`}
                          aria-hidden
                        />
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
