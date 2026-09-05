"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

// The consolidated "View Care Requests" destination the Admin dashboard's
// Quick Action points to. Reuses the existing GET /api/admin/care-requests
// route unchanged in shape (only its LIMIT was widened, from a
// dashboard-preview 15 to a browsing-page 50) — the sequential dispatch
// engine, Go Available, location matching, and payment processing this
// data comes from are all untouched.

type CareRequestRow = {
  id: string;
  caregiverType: "nanny" | "babysitter";
  status: string;
  date: string;
  startTime: string;
  createdAt: string;
};

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
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

const FILTERS = [
  "All",
  "Searching",
  "Caregiver Offer",
  "Awaiting Payment",
  "Confirmed / Paid",
  "In Progress",
  "Completed",
  "Cancelled",
  "Payment Expired",
] as const;

function formatDate(date: string, time: string): string {
  const d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) return `${date} ${time}`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminCareRequestsPage() {
  const [requests, setRequests] = useState<CareRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  useEffect(() => {
    apiFetch<{ careRequests: CareRequestRow[] }>("/api/admin/care-requests")
      .then((res) => {
        setError(null);
        setRequests(res.careRequests);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  const filtered = useMemo(() => {
    if (!requests) return null;
    if (filter === "All") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Care Requests</h1>
        <p className="text-[14px] text-ink-muted">
          Every stage of the caregiver dispatch process — searching, dispatching, accepted, and
          awaiting payment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
              filter === f
                ? "bg-wisteria text-sheet"
                : "border border-hairline bg-sheet text-ink-muted hover:text-ink"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && requests === null && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!error && filtered?.length === 0 && (
        <EmptyState
          icon={MagnifyingGlass}
          title="No care requests"
          description={
            filter === "All"
              ? "New requests will appear here when families request care."
              : "No care requests currently match this status."
          }
        />
      )}

      {!error && filtered && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {filtered.map((cr) => (
            <Sheet key={cr.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[12.5px] text-ink-muted">{cr.id.slice(0, 8)}</p>
                <p className="text-[15px] font-semibold text-ink">
                  {CAREGIVER_TYPE_LABEL[cr.caregiverType]}
                </p>
                <p className="text-[12.5px] text-ink-muted">
                  Requested for {formatDate(cr.date, cr.startTime)}
                </p>
              </div>
              <StatusBadge label={cr.status} tone={STATUS_TONE[cr.status] ?? "neutral"} />
            </Sheet>
          ))}
        </div>
      )}
    </div>
  );
}
