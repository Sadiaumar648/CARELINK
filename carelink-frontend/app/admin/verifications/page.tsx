"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

type Submission = {
  id: string;
  id_document_type: string;
  id_document_number: string;
  reference_name: string;
  reference_phone: string;
  photo_verdict: string;
  photo_rationale: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  users: { full_name: string; phone: string; role: string } | null;
};

type Detail = { submission: Submission; idDocumentUrl: string | null; selfieUrl: string | null };

const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  pending: "neutral",
  verified: "positive",
  rejected: "attention",
};

function VerdictNote({ verdict, rationale }: { verdict: string; rationale: string | null }) {
  if (verdict === "not_run") return null;
  return (
    <p className="text-[13px] text-ink-muted">
      Model plausibility check: <span className="font-semibold">{verdict.replace(/_/g, " ")}</span>
      {rationale && ` — ${rationale}`}
    </p>
  );
}

function ReviewPanel({ id, onDecided }: { id: string; onDecided: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Detail>(`/api/admin/verifications/${id}`)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  async function decide(decision: "verified" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/verifications/${id}`, {
        method: "PATCH",
        body: { decision, rejectionReason: decision === "rejected" ? reason : undefined },
      });
      onDecided();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (error) return <p className="text-[13px] text-error">{error}</p>;
  if (!detail) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {detail.idDocumentUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset
          <img
            src={detail.idDocumentUrl}
            alt="ID document"
            className="w-full rounded-[10px] border border-hairline"
          />
        )}
        {detail.selfieUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset
          <img
            src={detail.selfieUrl}
            alt="Selfie"
            className="w-full rounded-[10px] border border-hairline"
          />
        )}
      </div>
      <VerdictNote
        verdict={detail.submission.photo_verdict}
        rationale={detail.submission.photo_rationale}
      />
      <p className="text-[13px] text-ink-muted">
        {detail.submission.id_document_type.replace(/_/g, " ")} ·{" "}
        {detail.submission.id_document_number}
      </p>
      <p className="text-[13px] text-ink-muted">
        Reference: {detail.submission.reference_name} · {detail.submission.reference_phone}
      </p>
      {detail.submission.rejection_reason && (
        <p className="text-[13px] text-error">Rejected: {detail.submission.rejection_reason}</p>
      )}

      {detail.submission.status === "pending" &&
        (rejecting ? (
          <div className="flex flex-col gap-3">
            <Field
              label="Rejection reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && <p className="text-[13px] text-error">{error}</p>}
            <div className="flex gap-3">
              <Button
                variant="danger"
                disabled={busy || !reason}
                onClick={() => void decide("rejected")}
              >
                Confirm reject
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(false)}>
                Never mind
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => void decide("verified")}>
              Approve
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        ))}
    </div>
  );
}

export default function AdminVerificationsPage() {
  const [tab, setTab] = useState("pending");
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function load() {
    apiFetch<{ submissions: Submission[] }>(`/api/admin/verifications?status=${tab}`)
      .then((res) => {
        setError(null);
        setSubmissions(res.submissions);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(() => {
    apiFetch<{ submissions: Submission[] }>(`/api/admin/verifications?status=${tab}`)
      .then((res) => {
        setError(null);
        setSubmissions(res.submissions);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [tab, retryKey]);

  function selectTab(next: string) {
    setTab(next);
    setSubmissions(null);
    setOpenId(null);
    setError(null);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Verifications</h1>
        <p className="text-[14px] text-ink-muted">
          Identity verification submitted by parents and caregivers.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
              tab === t.key
                ? "bg-sage text-sheet"
                : "border border-hairline bg-sheet text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <ErrorState
          onRetry={() => {
            setError(null);
            setRetryKey((k) => k + 1);
          }}
        />
      )}

      {!error && submissions === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && submissions?.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title={tab === "pending" ? "No pending verifications" : `No ${tab} submissions`}
        />
      )}

      <div className="flex flex-col gap-4">
        {submissions?.map((s) => (
          <Sheet key={s.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[17px] font-semibold font-heading">{s.users?.full_name}</p>
                <p className="text-[13px] text-ink-muted">
                  {s.users?.role} · {s.users?.phone} · submitted{" "}
                  {new Date(s.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge label={s.status} tone={TONE[s.status] ?? "neutral"} />
                {openId !== s.id && (
                  <Button variant="secondary" onClick={() => setOpenId(s.id)}>
                    Review
                  </Button>
                )}
              </div>
            </div>
            {openId === s.id && (
              <ReviewPanel
                id={s.id}
                onDecided={() => {
                  setOpenId(null);
                  load();
                }}
              />
            )}
          </Sheet>
        ))}
      </div>
    </div>
  );
}
