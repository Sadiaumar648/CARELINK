"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet } from "@phosphor-icons/react";
import { CARELINK_HOURLY_RATES } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// Additive fields (real, already-existing bookings columns) added to
// GET /api/staff/earnings' response alongside the ones this page
// already used — see carelink-backend/app/api/staff/earnings/route.ts.
type Earning = {
  bookingId: string;
  reference: string;
  date: string;
  durationHours: number;
  hourlyRate: number;
  totalAmount: number;
  payoutAmount: number | null;
  settledAt: string | null;
};

type FilterKey = "week" | "month" | "lastMonth" | "allTime";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "allTime", label: "All time" },
];

// Derived from the booking's own real hourly_rate against CareLink's
// fixed rates — never a new field, never guessed. A booking priced
// before the fixed-rate model (or otherwise not an exact match) simply
// shows no care-type label rather than a wrong one.
function caregiverTypeLabel(hourlyRate: number): string | null {
  if (hourlyRate === CARELINK_HOURLY_RATES.nanny) return "Nanny";
  if (hourlyRate === CARELINK_HOURLY_RATES.babysitter) return "Babysitter";
  return null;
}

// The authoritative amount for a completed session: its real, settled
// payout once one exists, never recalculated from current rates. A
// completed booking whose payout hasn't settled yet (still processing)
// falls back to its own confirmed total — still a real, stored amount,
// never invented.
function amountFor(e: Earning): number {
  return e.payoutAmount ?? e.totalAmount;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Rolling 7 days, matching the "this week" convention already used
// elsewhere in this app (e.g. the Home dashboard's "Upcoming this
// week"), not a Mon–Sun calendar week.
function isThisWeek(iso: string, now: Date): boolean {
  const then = new Date(iso);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return then >= weekAgo && then <= now;
}

function isThisMonth(iso: string, now: Date): boolean {
  const then = new Date(iso);
  return then.getUTCFullYear() === now.getUTCFullYear() && then.getUTCMonth() === now.getUTCMonth();
}

function isLastMonth(iso: string, now: Date): boolean {
  const then = new Date(iso);
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return (
    then.getUTCFullYear() === lastMonth.getUTCFullYear() &&
    then.getUTCMonth() === lastMonth.getUTCMonth()
  );
}

function EarningRow({ earning }: { earning: Earning }) {
  const caregiverType = caregiverTypeLabel(earning.hourlyRate);
  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[15px] font-semibold text-ink">{formatDate(earning.date)}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
            {caregiverType && <span className="font-semibold text-ink">{caregiverType}</span>}
            {caregiverType && <span aria-hidden>·</span>}
            <span>
              {earning.durationHours} {earning.durationHours === 1 ? "hr" : "hrs"}
            </span>
          </div>
        </div>
        <StatusBadge label="Completed" tone="positive" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-[12px] text-ink-muted">{earning.reference}</span>
        <span className="text-[17px] font-semibold tabular-nums text-ink">
          GH₵{amountFor(earning)}
        </span>
      </div>
    </Sheet>
  );
}

export default function StaffEarningsPage() {
  const [earnings, setEarnings] = useState<Earning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("allTime");

  useEffect(() => {
    apiFetch<{ earnings: Earning[] }>("/api/staff/earnings")
      .then((res) => setEarnings(res.earnings))
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  // This Week / This Month summary cards — real totals + real session
  // counts, computed from the same real records the history list below
  // shows, never a separately hardcoded figure.
  const now = new Date();
  const weekEarnings = useMemo(
    () => (earnings ?? []).filter((e) => isThisWeek(e.date, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is stable enough for a per-render summary; re-deriving it every render would just restart the same window
    [earnings],
  );
  const monthEarnings = useMemo(
    () => (earnings ?? []).filter((e) => isThisMonth(e.date, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [earnings],
  );
  const weekTotal = weekEarnings.reduce((sum, e) => sum + amountFor(e), 0);
  const monthTotal = monthEarnings.reduce((sum, e) => sum + amountFor(e), 0);

  const filtered = useMemo(() => {
    if (!earnings) return null;
    if (filter === "allTime") return earnings;
    if (filter === "week") return earnings.filter((e) => isThisWeek(e.date, now));
    if (filter === "month") return earnings.filter((e) => isThisMonth(e.date, now));
    return earnings.filter((e) => isLastMonth(e.date, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnings, filter]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6 md:p-8">
      <Link
        href="/staff"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">Earnings</h1>
        <p className="text-[14px] text-ink-muted">Your earnings from completed care sessions.</p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && earnings === null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!error && earnings && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Sheet className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                This Week
              </span>
              <span className="text-[26px] font-semibold tabular-nums text-ink">
                GH₵{weekTotal}
              </span>
              <span className="text-[12.5px] text-ink-muted">
                {weekEarnings.length} completed {weekEarnings.length === 1 ? "session" : "sessions"}
              </span>
            </Sheet>
            <Sheet className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                This Month
              </span>
              <span className="text-[26px] font-semibold tabular-nums text-ink">
                GH₵{monthTotal}
              </span>
              <span className="text-[12.5px] text-ink-muted">
                {monthEarnings.length} completed{" "}
                {monthEarnings.length === 1 ? "session" : "sessions"}
              </span>
            </Sheet>
          </div>

          {earnings.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No earnings yet"
              description="Your earnings will appear here after you complete your first care session."
            />
          ) : (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold font-heading text-ink">
                  Earnings History
                </h2>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
                        filter === f.key
                          ? "bg-wisteria text-sheet"
                          : "bg-wisteria-tint text-wisteria-pressed hover:bg-wisteria-tint/70"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filtered && filtered.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No sessions in this period"
                  description="Try a different filter to see more of your earnings history."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {filtered?.map((e) => (
                    <EarningRow key={e.bookingId} earning={e} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
