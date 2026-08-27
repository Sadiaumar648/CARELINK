"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

type Submission = {
  id: string;
  id_document_type: string;
  id_document_number: string;
  reference_name: string;
  reference_phone: string;
  photo_verdict: string;
  photo_rationale: string | null;
  created_at: string;
  users: { full_name: string; phone: string; role: string } | null;
};

type Detail = { submission: Submission; idDocumentUrl: string | null; selfieUrl: string | null };

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

  if (error) return <p className="text-[13px] text-magenta">{error}</p>;
  if (!detail) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {detail.idDocumentUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset
          <img
            src={detail.idDocumentUrl}
            alt="ID document"
            className="w-full rounded border border-hairline"
          />
        )}
        {detail.selfieUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset
          <img
            src={detail.selfieUrl}
            alt="Selfie"
            className="w-full rounded border border-hairline"
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

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <Field
            label="Rejection reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
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
      )}
    </div>
  );
}

export default function AdminVerificationsPage() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    apiFetch<{ submissions: Submission[] }>("/api/admin/verifications?status=pending")
      .then((res) => setSubmissions(res.submissions))
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Verifications</h1>
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      {submissions === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {submissions?.length === 0 && <p className="text-[15px] text-ink-muted">Queue is empty.</p>}

      <div className="flex flex-col gap-4">
        {submissions?.map((s) => (
          <Sheet key={s.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[17px] font-semibold">{s.users?.full_name}</p>
                <p className="text-[13px] text-ink-muted">
                  {s.users?.role} · {s.users?.phone}
                </p>
              </div>
              {openId !== s.id && (
                <Button variant="secondary" onClick={() => setOpenId(s.id)}>
                  Review
                </Button>
              )}
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
