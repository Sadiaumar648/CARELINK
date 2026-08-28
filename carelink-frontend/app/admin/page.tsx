"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";

type Overview = {
  bookings: { total: number; completionRate: number; declineRate: number };
  revenue: { total: number; averageBookingValue: number };
  activeStaffCount: number;
  verificationQueue: { oldestPendingSince: string | null };
  openReports: number;
};

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
      <Sheet className="flex h-full flex-col gap-2 hover:outline hover:outline-2 hover:outline-sage">
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/api/admin/overview")
      .then(setOverview)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Overview</h1>
      <p className="text-[13px] text-ink-muted">Last 30 days.</p>
      {error && <p className="text-[13px] text-error">{error}</p>}

      {overview && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            href="/admin/bookings"
            label="Bookings"
            value={String(overview.bookings.total)}
            sub={`${Math.round(overview.bookings.completionRate * 100)}% completed`}
          />
          <Kpi
            href="/admin/bookings"
            label="Revenue"
            value={`GH₵${overview.revenue.total}`}
            sub={`avg GH₵${overview.revenue.averageBookingValue}/booking`}
          />
          <Kpi
            href="/admin/roster"
            label="Active staff"
            value={String(overview.activeStaffCount)}
          />
          <Kpi href="/admin/reports" label="Open reports" value={String(overview.openReports)} />
        </div>
      )}
    </div>
  );
}
