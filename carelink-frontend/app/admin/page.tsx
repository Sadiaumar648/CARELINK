"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  MagnifyingGlass,
  Star,
  UserPlus,
  UsersFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/empty-state";

// FINAL CARELINK ADMIN DASHBOARD. Deliberately small: a greeting, one
// real financial figure (Revenue, reusing the existing
// GET /api/admin/overview route's own computed revenue.total — nothing
// hardcoded), and Quick Actions as the dashboard's real operational
// surface. Every other figure this page used to show (caregiver counts,
// booking-status counts, open reports, a Recent Care Requests table, a
// Caregivers Available Now list, a Recent Activity feed) has been
// removed from Home and now lives inside the destination page it
// actually belongs to (View Care Requests, Manage Bookings, View
// Reviews, Manage Caregivers) — nothing duplicated across two places.

type Overview = {
  revenue: { total: number };
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

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Month-to-date revenue, reusing the existing overview route's own
    // from/to query-param support — no new backend logic.
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const params = `?from=${encodeURIComponent(monthStart.toISOString())}`;

    apiFetch<Overview>(`/api/admin/overview${params}`)
      .then((res) => {
        setError(null);
        setOverview(res);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold font-heading text-ink">{greeting()}, CareLink 👋</h1>
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
          <Sheet className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
              <Wallet size={16} className="text-wisteria" />
              Revenue
            </span>
            <span className="text-[32px] font-bold tabular-nums text-ink">
              {overview === null ? "…" : `GH₵${overview.revenue.total.toLocaleString()}`}
            </span>
            <p className="text-[13px] text-ink-muted">Revenue generated from CareLink bookings.</p>
          </Sheet>

          <section className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold text-ink">Quick Actions</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                href="/admin/roster"
                icon={UserPlus}
                label="Onboard Caregiver"
                description="Create a new caregiver account and issue their CareLink login."
              />
              <QuickAction
                href="/admin/roster"
                icon={UsersThree}
                label="Manage Caregivers"
                description="View and manage every caregiver on the platform."
              />
              <QuickAction
                href="/admin/users"
                icon={UsersFour}
                label="Manage Parents"
                description="View and manage every parent on the platform."
              />
              <QuickAction
                href="/admin/care-requests"
                icon={MagnifyingGlass}
                label="View Care Requests"
                description="Requests searching, dispatching, accepted, or awaiting payment."
              />
              <QuickAction
                href="/admin/bookings"
                icon={CalendarCheck}
                label="Manage Bookings"
                description="Every booking on the platform, by status and date."
              />
              <QuickAction
                href="/admin/reviews"
                icon={Star}
                label="View Reviews"
                description="Moderate submitted reviews and accounts that need attention."
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
