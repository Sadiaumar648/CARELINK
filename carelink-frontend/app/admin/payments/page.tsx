"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CreditCard } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin's "Payments" — the first admin-facing surface over the real,
// existing payments table (GET /api/admin/payments, new but read-only:
// no payment logic, no Paystack/provider change, same RLS payments
// already had). This is where Revenue/financial detail lives now,
// separate from Admin Home.

type Payment = {
  id: string;
  bookingId: string;
  bookingReference: string | null;
  network: "mtn" | "telecel" | "airteltigo";
  amount: number;
  status: "initiated" | "pending" | "succeeded" | "failed" | "timed_out" | "refunded";
  failureReason: string | null;
  settledAt: string | null;
  createdAt: string;
};

const STATUSES = ["", "initiated", "pending", "succeeded", "failed", "timed_out", "refunded"];

const TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  initiated: "info",
  pending: "info",
  succeeded: "positive",
  failed: "attention",
  timed_out: "attention",
  refunded: "neutral",
};

const NETWORK_LABEL: Record<string, string> = {
  mtn: "MTN Mobile Money",
  telecel: "Telecel Cash",
  airteltigo: "AirtelTigo Money",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AdminPaymentsPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Not a direct setPayments(null) at the top of the effect body — the
  // linter (correctly) flags synchronous setState there. The cleanup
  // function clears stale data on the way out instead, same pattern as
  // the admin Reports page.
  useEffect(() => {
    let cancelled = false;
    const params = status ? `?status=${status}` : "";
    apiFetch<{ payments: Payment[] }>(`/api/admin/payments${params}`)
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setPayments(res.payments);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
      setPayments(null);
    };
  }, [status, retryKey]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading text-ink">Payments</h1>
        <p className="text-[14px] text-ink-muted">Every payment attempt on the platform.</p>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-fit rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] text-ink"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s ? s.replace(/_/g, " ") : "All statuses"}
          </option>
        ))}
      </select>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && payments === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && payments?.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title="No payments found"
          description="Try a different filter."
        />
      )}

      <div className="flex flex-col gap-3">
        {payments?.map((p) => (
          <Sheet key={p.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-ink">GH₵{p.amount.toLocaleString()}</p>
              <p className="text-[13px] text-ink-muted">
                {p.bookingReference ?? "—"} · {NETWORK_LABEL[p.network] ?? p.network}
              </p>
              <p className="text-[12px] text-ink-muted">
                {formatDate(p.settledAt ?? p.createdAt)}
                {p.failureReason ? ` · ${p.failureReason}` : ""}
              </p>
            </div>
            <StatusBadge label={p.status.replace(/_/g, " ")} tone={TONE[p.status] ?? "neutral"} />
          </Sheet>
        ))}
      </div>
    </div>
  );
}

export default function AdminPaymentsPageWrapper() {
  return (
    <Suspense>
      <AdminPaymentsPage />
    </Suspense>
  );
}
