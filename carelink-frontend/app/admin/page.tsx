"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";

type Overview = {
  bookings: {
    total: number;
    byStatus: Record<string, number>;
    completionRate: number;
    declineRate: number;
  };
  revenue: { total: number; averageBookingValue: number };
  activeStaffCount: number;
  verificationQueue: { oldestPendingSince: string | null };
  openReports: number;
};

type RosterEntry = { verificationStatus: string };

function Kpi({
  href,
  label,
  value,
  sub,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Link href={href}>
      <Sheet className="flex h-full flex-col gap-2 hover:border-sage/50">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </span>
        <span className="text-[28px] font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-[13px] text-ink-muted">{sub}</span>}
      </Sheet>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [caregiverCount, setCaregiverCount] = useState<number | null>(null);
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<Overview>("/api/admin/overview")
      .then(setOverview)
      .catch((err) => setError(errorMessage(err)));

    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => {
        setCaregiverCount(res.roster.length);
        setVerifiedCount(res.roster.filter((r) => r.verificationStatus === "verified").length);
      })
      .catch(() => undefined);

    apiFetch<{ submissions: unknown[] }>("/api/admin/verifications?status=pending")
      .then((res) => setPendingVerifications(res.submissions.length))
      .catch(() => undefined);
  }, [retryKey]);

  const byStatus = overview?.bookings.byStatus ?? {};

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Overview</h1>
        <p className="text-[13px] text-ink-muted">
          Bookings and revenue figures cover the last 30 days.
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && !overview && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!error && overview && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            href="/admin/roster"
            label="Total caregivers"
            value={caregiverCount === null ? "…" : String(caregiverCount)}
          />
          <Kpi
            href="/admin/roster"
            label="Verified caregivers"
            value={verifiedCount === null ? "…" : String(verifiedCount)}
          />
          <Kpi
            href="/admin/verifications"
            label="Pending verifications"
            value={pendingVerifications === null ? "…" : String(pendingVerifications)}
          />
          <Kpi href="/admin/reports" label="Open reports" value={String(overview.openReports)} />
          <Kpi
            href="/admin/bookings?status=pending"
            label="Pending bookings"
            value={String(byStatus.pending ?? 0)}
          />
          <Kpi
            href="/admin/bookings?status=active"
            label="Active bookings"
            value={String(byStatus.active ?? 0)}
          />
          <Kpi
            href="/admin/bookings?status=completed"
            label="Completed bookings"
            value={String(byStatus.completed ?? 0)}
            sub={`${Math.round(overview.bookings.completionRate * 100)}% of total`}
          />
          <Kpi
            href="/admin/bookings"
            label="Revenue"
            value={`GH₵${overview.revenue.total}`}
            sub={`avg GH₵${overview.revenue.averageBookingValue}/booking`}
          />
        </div>
      )}
    </div>
  );
}
