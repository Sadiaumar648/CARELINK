"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChatCircleDots } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// "View all" destination for Admin Home's Recent Activity (which now
// shows only the 4 newest). Reuses GET /api/admin/activity exactly as
// it already exists — that route caps itself at 15 real, merged events
// (booking status changes, applications, reviews, payments, care
// requests); this page shows all of what it returns rather than
// re-slicing further. No new backend route, no pagination invented.

type ActivityRow = {
  bookingId: string | null;
  reference: string | null;
  label: string;
  occurredAt: string;
};

function activityDotClass(label: string): string {
  if (label.includes("started") || label.includes("Payment")) return "bg-[var(--color-success)]";
  if (label.includes("application")) return "bg-[var(--color-bluebell-pressed)]";
  if (label.includes("review")) return "bg-wisteria";
  if (label.includes("request created")) return "bg-[var(--color-gold)]";
  if (label.includes("cancelled") || label.includes("declined")) return "bg-error";
  return "bg-ink-muted/50";
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ activity: ActivityRow[] }>("/api/admin/activity")
      .then((res) => {
        setError(null);
        setActivity(res.activity);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading text-ink">Recent Activity</h1>
        <p className="text-[14px] text-ink-muted">Latest updates on the platform.</p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && activity === null && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!error && activity?.length === 0 && (
        <EmptyState icon={ChatCircleDots} title="No recent activity" />
      )}

      {!error && activity && activity.length > 0 && (
        <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[16px] border border-hairline bg-sheet">
          {activity.map((a, i) => (
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
    </div>
  );
}
