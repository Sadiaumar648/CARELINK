"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, UploadSimple, Warning } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CameraCapture } from "@/components/camera-capture";
import { Stepper } from "@/components/onboarding/stepper";
import { SelectableCard } from "@/components/onboarding/selectable-card";

type Submission = {
  id: string;
  status: "pending" | "verified" | "rejected";
  id_document_type: string;
  rejection_reason: string | null;
  created_at: string;
};

type IdType = "ghana_card" | "passport" | "voter_id";

const ID_TYPES: { value: IdType; label: string }[] = [
  { value: "ghana_card", label: "Ghana Card" },
  { value: "passport", label: "Passport" },
  { value: "voter_id", label: "Voter ID" },
];

const STEPS = ["ID type", "Upload ID", "Live photo", "Review"];

type Step = "intro" | "upload" | "photo" | "review" | "submitted";

export default function IdentityVerificationPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  // An existing agency parent/caregiver onboarded by an admin (see
  // api/admin/parents and api/admin/staff's agencyVerified flag) has
  // verification_status "verified" directly on their account but no
  // verification_submissions row at all — nothing was ever uploaded
  // through CareLink to review. Checked separately from `submissions`
  // so that case still skips the document-upload wizard.
  const [agencyVerified, setAgencyVerified] = useState<boolean | null>(null);

  const [step, setStep] = useState<Step>("intro");
  const [idDocumentType, setIdDocumentType] = useState<IdType>("ghana_card");
  const [idDocumentNumber, setIdDocumentNumber] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieMode, setSelfieMode] = useState<"camera" | "file">("camera");
  const [referenceName, setReferenceName] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [referenceRelation, setReferenceRelation] = useState("");
  const [consent, setConsent] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ submissions: Submission[] }>("/api/verification/submissions")
      .then((res) => {
        if (!cancelled) setSubmissions(res.submissions);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ verificationStatus: string }>("/api/me")
      .then((res) => {
        if (!cancelled) setAgencyVerified(res.verificationStatus === "verified");
      })
      .catch(() => {
        if (!cancelled) setAgencyVerified(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = submissions?.[0] ?? null;
  const agencyVerifiedNoSubmission = agencyVerified === true && !latest;
  const showStatus = (latest || agencyVerifiedNoSubmission) && !resubmitting;

  function goUpload() {
    setStepError(null);
    setStep("upload");
  }

  function goPhoto() {
    if (!idDocumentNumber.trim()) {
      setStepError("Enter your ID number.");
      return;
    }
    if (!idFile) {
      setStepError("Upload a photo of your ID before continuing.");
      return;
    }
    setStepError(null);
    setStep("photo");
  }

  function goReview() {
    if (!selfieFile) {
      setStepError("Take a live photo before continuing.");
      return;
    }
    setStepError(null);
    setStep("review");
  }

  async function onSubmit() {
    if (!referenceName.trim() || !referencePhone.trim()) {
      setStepError("Enter a reference name and phone number.");
      return;
    }
    if (!consent) {
      setStepError("Please confirm consent to continue.");
      return;
    }
    if (!idFile) {
      setStepError("Your ID photo is missing — go back and upload it again.");
      return;
    }
    setSubmitting(true);
    setStepError(null);
    try {
      const form = new FormData();
      form.set("idDocumentType", idDocumentType);
      form.set("idDocumentNumber", idDocumentNumber);
      form.set("referenceName", referenceName);
      form.set("referencePhone", referencePhone);
      if (referenceRelation.trim()) form.set("referenceRelation", referenceRelation);
      form.set("idDocumentFile", idFile);
      if (selfieFile) form.set("selfieFile", selfieFile);
      form.set("consentPhoto", "true");
      await apiFetch("/api/verification/submissions", { method: "POST", body: form });
      setStep("submitted");
    } catch (err) {
      setStepError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if ((submissions === null || agencyVerified === null) && !loadError) {
    return <p className="text-[13px] text-ink-muted">Loading…</p>;
  }

  if (showStatus && latest) {
    if (latest.status === "verified") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <CheckCircle size={48} weight="fill" className="text-[var(--color-success)]" />
          <h1 className="text-[24px] font-semibold font-heading">You&apos;re verified!</h1>
          <p className="max-w-sm text-[15px] text-ink-muted">
            Your identity has been successfully verified.
          </p>
          <Button onClick={() => router.push("/onboarding/setup")}>Continue →</Button>
        </div>
      );
    }
    if (latest.status === "rejected") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Warning size={48} weight="fill" className="text-error" />
          <h1 className="text-[24px] font-semibold font-heading">Action required</h1>
          <p className="max-w-sm text-[15px] text-ink-muted">
            We couldn&apos;t complete your verification. Please review the requested information and
            submit again.
          </p>
          {latest.rejection_reason && (
            <Sheet className="max-w-sm text-left text-[13px] text-ink-muted">
              {latest.rejection_reason}
            </Sheet>
          )}
          <Button
            onClick={() => {
              setResubmitting(true);
              setStep("intro");
            }}
          >
            Submit again →
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle size={48} weight="fill" className="text-sage" />
        <h1 className="text-[24px] font-semibold font-heading">Verification submitted</h1>
        <p className="max-w-sm text-[15px] text-ink-muted">
          Your identity verification is being reviewed. This usually doesn&apos;t take long — you
          can continue setting up your profile in the meantime.
        </p>
        <Button onClick={() => router.push("/onboarding/setup")}>Continue →</Button>
      </div>
    );
  }

  if (showStatus && agencyVerifiedNoSubmission) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle size={48} weight="fill" className="text-[var(--color-success)]" />
        <h1 className="text-[24px] font-semibold font-heading">You&apos;re verified!</h1>
        <p className="max-w-sm text-[15px] text-ink-muted">
          Your identity has already been verified by CareLink.
        </p>
        <Button onClick={() => router.push("/onboarding/setup")}>Continue →</Button>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle size={48} weight="fill" className="text-[var(--color-success)]" />
        <h1 className="text-[24px] font-semibold font-heading">Verification submitted</h1>
        <p className="max-w-sm text-[15px] text-ink-muted">
          Your identity verification has been submitted and is being reviewed.
        </p>
        <Button onClick={() => router.push("/onboarding/setup")}>Continue →</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Stepper
        steps={STEPS}
        current={STEPS.indexOf(
          step === "intro"
            ? "ID type"
            : step === "upload"
              ? "Upload ID"
              : step === "photo"
                ? "Live photo"
                : "Review",
        )}
      />

      {step === "intro" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Verify your identity</h1>
            <p className="text-[15px] text-ink-muted">
              To help keep CareLink safe for families and caregivers, we need to verify your
              identity. We&apos;ll ask for a government-issued ID and a live photo. Your
              verification information is only accessible to authorized users and verification
              processes.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-ink">What type of ID are you using?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ID_TYPES.map((t) => (
                <SelectableCard
                  key={t.value}
                  title={t.label}
                  selected={idDocumentType === t.value}
                  onClick={() => setIdDocumentType(t.value)}
                />
              ))}
            </div>
          </div>
          {loadError && <p className="text-[13px] text-error">{loadError}</p>}
          <Button onClick={goUpload}>Continue →</Button>
        </div>
      )}

      {step === "upload" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Upload your ID</h1>
            <p className="text-[15px] text-ink-muted">
              Upload a clear photo of your {ID_TYPES.find((t) => t.value === idDocumentType)?.label}
              .
            </p>
          </div>
          <Field
            label="ID number"
            required
            value={idDocumentNumber}
            onChange={(e) => setIdDocumentNumber(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <label
              htmlFor="idFile"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
            >
              Photo of your ID
            </label>
            {idFile ? (
              <Sheet className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[14px] text-ink">
                  <CheckCircle size={18} className="text-[var(--color-success)]" weight="fill" />
                  ID uploaded — {idFile.name}
                </p>
                <button
                  type="button"
                  onClick={() => setIdFile(null)}
                  className="text-[13px] font-semibold text-sage hover:text-sage-hover"
                >
                  Remove
                </button>
              </Sheet>
            ) : (
              <label
                htmlFor="idFile"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-2 border-dashed border-hairline bg-sheet px-6 py-10 text-center hover:border-sage/50"
              >
                <UploadSimple size={24} className="text-sage" />
                <span className="text-[14px] font-semibold text-ink">Tap to upload a photo</span>
                <span className="text-[12px] text-ink-muted">JPG or PNG, up to 10MB</span>
                <input
                  id="idFile"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
          {stepError && <p className="text-[13px] text-error">{stepError}</p>}
          <div className="flex gap-3">
            <Button onClick={goPhoto}>Continue →</Button>
            <Button type="button" variant="secondary" onClick={() => setStep("intro")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === "photo" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Take a live photo</h1>
            <p className="text-[15px] text-ink-muted">
              Take a current photo of yourself using your device camera. This helps us verify the
              person submitting the account.
            </p>
          </div>

          {selfieFile ? (
            <div className="flex flex-col items-center gap-4">
              <p className="flex items-center gap-2 text-[14px] text-ink">
                <CheckCircle size={18} className="text-[var(--color-success)]" weight="fill" />
                Live photo captured
              </p>
              <div className="flex gap-3">
                <Button onClick={goReview}>Continue →</Button>
                <Button type="button" variant="secondary" onClick={() => setSelfieFile(null)}>
                  Retake
                </Button>
              </div>
            </div>
          ) : selfieMode === "camera" ? (
            <CameraCapture onCapture={setSelfieFile} onFallback={() => setSelfieMode("file")} />
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                className="text-[13px]"
              />
              <p className="text-[13px] text-ink-muted">
                Camera access is required to take your live photo. You can attach a recent photo
                instead.
              </p>
            </div>
          )}

          {stepError && <p className="text-[13px] text-error">{stepError}</p>}
          <Button type="button" variant="secondary" onClick={() => setStep("upload")}>
            Back
          </Button>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Review your information</h1>
            <p className="text-[15px] text-ink-muted">
              Your information will be submitted for identity verification.
            </p>
          </div>

          <Sheet className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[14px] text-ink">
                <CheckCircle size={18} className="text-[var(--color-success)]" weight="fill" />
                Identity document uploaded
              </p>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="text-[13px] font-semibold text-sage hover:text-sage-hover"
              >
                Replace ID
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[14px] text-ink">
                <CheckCircle size={18} className="text-[var(--color-success)]" weight="fill" />
                Live photo captured
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelfieFile(null);
                  setStep("photo");
                }}
                className="text-[13px] font-semibold text-sage hover:text-sage-hover"
              >
                Retake photo
              </button>
            </div>
          </Sheet>

          <div className="flex flex-col gap-4">
            <p className="text-[13px] font-semibold text-ink">
              A reference we can contact to help confirm your identity
            </p>
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
            <Field
              label="Relationship (optional)"
              value={referenceRelation}
              onChange={(e) => setReferenceRelation(e.target.value)}
            />
            <label className="flex items-start gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              I consent to my live photo being compared against my ID as part of verification.
            </label>
          </div>

          {stepError && <p className="text-[13px] text-error">{stepError}</p>}
          <Button onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? "Submitting your verification…" : "Submit for Review →"}
          </Button>
        </div>
      )}
    </div>
  );
}
