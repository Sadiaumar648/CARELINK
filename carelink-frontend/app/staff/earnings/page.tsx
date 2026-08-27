"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";

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

  useEffect(() => {
    apiFetch<{ earnings: Earning[]; totals: { week: number; month: number } }>(
      "/api/staff/earnings",
    )
      .then((res) => {
        setEarnings(res.earnings);
        setTotals(res.totals);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Earnings</h1>
      {error && <p className="text-[13px] text-magenta">{error}</p>}

      {totals && (
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

      {earnings === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {earnings?.length === 0 && (
        <p className="text-[15px] text-ink-muted">No completed bookings yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {earnings?.map((e) => (
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
    </div>
  );
}
