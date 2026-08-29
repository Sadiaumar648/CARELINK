"use client";

import { useEffect, useState } from "react";
import { Flag } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

type Report = {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  reporter: { full_name: string } | null;
  subject: { full_name: string; role: string } | null;
};

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  open: "attention",
  investigating: "neutral",
  resolved: "positive",
};

function ReportCard({ report, onChanged }: { report: Report; onChanged: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "investigating" | "resolved") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        body: { status, resolutionNote: status === "resolved" ? note || undefined : undefined },
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[17px] font-semibold">
            {report.subject?.full_name}{" "}
            <span className="text-ink-muted">({report.subject?.role})</span>
          </p>
          <p className="text-[13px] text-ink-muted">
            {report.category.replace(/_/g, " ")} · reported by {report.reporter?.full_name}
          </p>
        </div>
        <StatusBadge label={report.status} tone={TONE[report.status] ?? "neutral"} />
      </div>
      <p className="text-[15px] leading-relaxed">{report.description}</p>
      {error && <p className="text-[13px] text-error">{error}</p>}

      {report.status !== "resolved" && (
        <div className="flex flex-col gap-3">
          {report.status === "open" && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void setStatus("investigating")}
            >
              Start investigating
            </Button>
          )}
          {resolving ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Resolution note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button disabled={busy} onClick={() => void setStatus("resolved")}>
                Confirm resolved
              </Button>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => setResolving(true)}>
              Mark resolved
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function AdminReportsPage() {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function load() {
    setReports(null);
    apiFetch<{ reports: Report[] }>(`/api/admin/reports?status=${status}`)
      .then((res) => setReports(res.reports))
      .catch((err) => setError(errorMessage(err)));
  }

  // Not `useEffect(load, ...)`: load's own synchronous `setReports(null)`
  // is fine when a report action calls it directly, but the linter
  // (correctly) flags that same shape when it's the effect body itself.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ reports: Report[] }>(`/api/admin/reports?status=${status}`)
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setReports(res.reports);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
      setReports(null);
    };
  }, [status, retryKey]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold font-heading">Reports</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] text-ink"
        >
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && reports === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && reports?.length === 0 && (
        <EmptyState icon={Flag} title="No reported issues" description="Nothing here right now." />
      )}

      <div className="flex flex-col gap-4">
        {reports?.map((r) => (
          <ReportCard key={r.id} report={r} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
