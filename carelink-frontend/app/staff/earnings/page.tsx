"use client";

import { useEffect, useState } from "react";
import { Wallet } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Earning = {
  bookingId: string;
  reference: string;
  date: string;
  payoutAmount: number | null;
  settledAt: string | null;
};

export default function StaffEarningsPage() {
  const [earnings, setEarnings] = useState<Earning[] | null>(null);
  const [totals, setTotals] = useState<{ week: number; month: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ earnings: Earning[]; totals: { week: number; month: number } }>(
      "/api/staff/earnings",
    )
      .then((res) => {
        setEarnings(res.earnings);
        setTotals(res.totals);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Earnings</h1>
        <p className="text-[14px] text-ink-muted">Your payouts from completed bookings.</p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && !totals && (
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {!error && totals && (
        <div className="grid grid-cols-2 gap-4">
          <Sheet className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              This week
            </span>
            <span className="text-[28px] font-semibold tabular-nums">GH₵{totals.week}</span>
          </Sheet>
          <Sheet className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              This month
            </span>
            <span className="text-[28px] font-semibold tabular-nums">GH₵{totals.month}</span>
          </Sheet>
        </div>
      )}

      {!error && earnings === null && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {!error && earnings?.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No completed bookings yet"
          description="Payouts from completed care sessions will appear here."
        />
      )}

      {!error && earnings && earnings.length > 0 && (
        <div className="flex flex-col gap-3">
          {earnings.map((e) => (
            <Sheet key={e.bookingId} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold">{e.reference}</p>
                <p className="text-[13px] text-ink-muted">
                  {new Date(e.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <p className="text-[15px] font-semibold tabular-nums">
                {e.payoutAmount != null ? `GH₵${e.payoutAmount}` : "Pending"}
              </p>
            </Sheet>
          ))}
        </div>
      )}
    </div>
  );
}
