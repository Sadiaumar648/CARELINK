"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { CameraCapture } from "@/components/camera-capture";

type Submission = {
  id: string;
  status: string;
  id_document_type: string;
  rejection_reason: string | null;
  created_at: string;
};

const TONE: Record<string, "neutral" | "positive" | "attention"> = {
  pending: "neutral",
  verified: "positive",
  rejected: "attention",
};

export function VerificationForm() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [idDocumentType, setIdDocumentType] = useState<"ghana_card" | "passport" | "voter_id">(
    "ghana_card",
  );
  const [idDocumentNumber, setIdDocumentNumber] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieMode, setSelfieMode] = useState<"camera" | "file">("camera");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiFetch<{ submissions: Submission[] }>("/api/verification/submissions")
      .then((res) => setSubmissions(res.submissions))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idFile) {
      setError("Attach a photo of your ID document");
      return;
    }
    if (!selfieFile) {
      setError("Take a selfie");
      return;
    }
    if (!consent) {
      setError("Consent to the selfie comparison to continue");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("idDocumentType", idDocumentType);
      form.set("idDocumentNumber", idDocumentNumber);
      form.set("referenceName", referenceName);
      form.set("referencePhone", referencePhone);
      form.set("idDocumentFile", idFile);
      form.set("selfieFile", selfieFile);
      form.set("consentPhoto", "true");
      await apiFetch("/api/verification/submissions", { method: "POST", body: form });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const latest = submissions?.[0];
  const canResubmit = !latest || latest.status === "rejected";

  return (
    <div className="flex flex-col gap-6">
      {submissions === null && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {submissions && submissions.length > 0 && (
        <div className="flex flex-col gap-2">
          {submissions.map((s) => (
            <Sheet key={s.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold">{s.id_document_type.replace(/_/g, " ")}</p>
                {s.rejection_reason && (
                  <p className="text-[13px] text-ink-muted">{s.rejection_reason}</p>
                )}
              </div>
              <StatusBadge label={s.status} tone={TONE[s.status] ?? "neutral"} />
            </Sheet>
          ))}
        </div>
      )}

      {done && (
        <p className="text-[15px] text-ink-muted">
          Submitted — an administrator will review it soon.
        </p>
      )}

      {submissions && !done && canResubmit && (
        <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <h2 className="text-[19px] font-semibold">Verify your identity</h2>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="idDocumentType"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
            >
              ID type
            </label>
            <select
              id="idDocumentType"
              value={idDocumentType}
              onChange={(e) => setIdDocumentType(e.target.value as typeof idDocumentType)}
              className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
            >
              <option value="ghana_card">Ghana Card</option>
              <option value="passport">Passport</option>
              <option value="voter_id">Voter ID</option>
            </select>
          </div>
          <Field
            label="ID number"
            required
            value={idDocumentNumber}
            onChange={(e) => setIdDocumentNumber(e.target.value)}
          />
          <Field
            label="Reference name"
            required
            value={referenceName}
            onChange={(e) => setReferenceName(e.target.value)}
          />
          <Field
            label="Reference phone"
            type="tel"
            required
            value={referencePhone}
            onChange={(e) => setReferencePhone(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor="idFile"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
            >
              Photo of your ID
            </label>
            <input
              id="idFile"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
              className="text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Selfie
            </span>

            {selfieFile ? (
              <div className="flex items-center gap-3">
                <p className="text-[13px] text-ink-muted">Selfie captured.</p>
                <button
                  type="button"
                  onClick={() => setSelfieFile(null)}
                  className="text-[13px] font-semibold text-sage"
                >
                  Retake
                </button>
              </div>
            ) : selfieMode === "camera" ? (
              <CameraCapture onCapture={setSelfieFile} onFallback={() => setSelfieMode("file")} />
            ) : (
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                className="text-[13px]"
              />
            )}

            {selfieFile && (
              <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I consent to this selfie being compared against my ID by an automated service
              </label>
            )}
          </div>

          {error && <p className="text-[13px] text-error">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for review"}
          </Button>
        </Sheet>
      )}
    </div>
  );
}
