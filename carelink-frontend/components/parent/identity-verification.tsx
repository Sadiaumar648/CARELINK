"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, CircleNotch, Circle, XCircle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { CameraCapture } from "@/components/camera-capture";

// CareLink's parent identity verification — an ACADEMIC SIMULATION of a
// Ghana Card check through the National Identification Authority's
// Identity Verification Services Platform (NIA/IVSP). CareLink has no
// institutional relationship with NIA; nothing here calls out to NIA or
// any external identity system. See carelink-backend/lib/services/
// identity-verification.ts (MockNIAProvider) for exactly what the
// simulated result is built from. A production deployment would replace
// that provider with an authorized NIA/IVSP integration after
// institutional onboarding, approval, and contractual requirements —
// this UI, and the IdentityVerificationService seam it talks to, are
// written so that swap wouldn't require rebuilding this flow.

type FailureReason = "pin_mismatch" | "biometric_mismatch" | "incomplete" | null;

type VerificationResult = {
  status: "verified" | "failed";
  provider: string;
  pinMatch: boolean;
  biodataMatch: boolean;
  biometricMatch: boolean;
  verifiedName: string | null;
  verifiedDateOfBirth: string | null;
  verificationReference: string;
  failureReason: FailureReason;
  createdAt: string;
};

type Step = "intro" | "pin" | "selfie" | "verifying" | "result";

const STAGES = [
  "Checking Ghana Card PIN",
  "Matching identity record",
  "Comparing live photo",
  "Completing identity verification",
];
const STAGE_INTERVAL_MS = 700;

const FAILURE_COPY: Record<Exclude<FailureReason, null>, string> = {
  pin_mismatch: "Identity could not be verified. Please check your Ghana Card PIN and try again.",
  biometric_mismatch: "Live photo could not be matched to the submitted identity information.",
  incomplete: "Additional verification is required.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ResultCard({
  result,
  onRetry,
  continueHref,
}: {
  result: VerificationResult;
  onRetry: () => void;
  continueHref?: string;
}) {
  if (result.status === "verified") {
    return (
      <Sheet className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <CheckCircle size={26} weight="fill" className="text-[var(--color-success)]" />
          <h3 className="text-[16px] font-semibold text-ink">Identity Verified</h3>
        </div>
        <p className="text-[13.5px] text-ink-muted">
          Your identity has been successfully verified.
        </p>
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-hairline bg-paper p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Name
            </span>
            <span className="text-[13.5px] font-medium text-ink">{result.verifiedName}</span>
          </div>
          {result.verifiedDateOfBirth && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Date of Birth
              </span>
              <span className="text-[13.5px] font-medium text-ink">
                {formatDate(result.verifiedDateOfBirth)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Identity Document
            </span>
            <span className="text-[13.5px] font-medium text-ink">Ghana Card</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Verification Status
            </span>
            <StatusBadge label="Verified" tone="positive" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Verification Reference
            </span>
            <span className="text-[13px] font-mono text-ink-muted">
              {result.verificationReference}
            </span>
          </div>
        </div>
        {continueHref && (
          <LinkButton href={continueHref} className="self-start">
            Continue to CareLink
          </LinkButton>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <XCircle size={26} weight="fill" className="text-error" />
        <h3 className="text-[16px] font-semibold text-ink">Identity Could Not Be Verified</h3>
      </div>
      <p className="text-[13.5px] text-ink-muted">
        {result.failureReason ? FAILURE_COPY[result.failureReason] : FAILURE_COPY.incomplete}
      </p>
      <Button type="button" onClick={onRetry} className="self-start">
        Try Again
      </Button>
    </Sheet>
  );
}

function VerifyingCard({ stageIndex }: { stageIndex: number }) {
  return (
    <Sheet className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <CircleNotch size={22} className="animate-spin text-wisteria" />
        <h3 className="text-[16px] font-semibold text-ink">Verifying your identity…</h3>
      </div>
      <div className="flex flex-col gap-2.5">
        {STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-2.5">
            {i < stageIndex ? (
              <CheckCircle
                size={18}
                weight="fill"
                className="shrink-0 text-[var(--color-success)]"
              />
            ) : i === stageIndex ? (
              <CircleNotch size={18} className="shrink-0 animate-spin text-wisteria" />
            ) : (
              <Circle size={18} className="shrink-0 text-ink-muted/40" />
            )}
            <span className={`text-[13.5px] ${i <= stageIndex ? "text-ink" : "text-ink-muted"}`}>
              {stage}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function ParentIdentityVerification({
  continueHref,
}: {
  // When set, a verified result shows a "Continue to CareLink" button
  // linking here — used by the forced post-registration verification
  // page. Omitted on /parent/account, where this same component is
  // embedded read-only alongside other settings.
  continueHref?: string;
} = {}) {
  const { refreshVerificationStatus } = useAuth();
  const [step, setStep] = useState<Step>("intro");
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [existingResult, setExistingResult] = useState<VerificationResult | null>(null);
  const [lastFailure, setLastFailure] = useState<VerificationResult | null>(null);

  const [ghanaCardPin, setGhanaCardPin] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Already verified, or previously attempted and failed — either way,
  // the parent's own real history, never reconstructed client-side.
  useEffect(() => {
    apiFetch<{ attempts: VerificationResult[] }>("/api/parent/identity-verification")
      .then((res) => {
        const latest = res.attempts[0] ?? null;
        if (latest?.status === "verified") {
          setExistingResult(latest);
          void refreshVerificationStatus();
        } else if (latest?.status === "failed") setLastFailure(latest);
      })
      .catch(() => undefined)
      .finally(() => setLoadingExisting(false));
  }, [refreshVerificationStatus]);

  function stopStageTimer() {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }
  useEffect(() => stopStageTimer, []);

  function startOver() {
    setGhanaCardPin("");
    setDateOfBirth("");
    setFormError(null);
    setSubmitError(null);
    setResult(null);
    setStep("pin");
  }

  function onPinContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!ghanaCardPin.trim()) {
      setFormError("Enter your Ghana Card PIN.");
      return;
    }
    if (!dateOfBirth) {
      setFormError("Enter your date of birth.");
      return;
    }
    setFormError(null);
    setStep("selfie");
  }

  async function submit(file: File) {
    setStep("verifying");
    setStageIndex(0);
    setSubmitError(null);

    // A short, realistic loading sequence rather than an instant status
    // flip — purely cosmetic, independent of the real request below.
    stageTimerRef.current = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    const minDuration = new Promise((resolve) =>
      setTimeout(resolve, STAGE_INTERVAL_MS * STAGES.length),
    );

    try {
      const form = new FormData();
      form.set("ghanaCardPin", ghanaCardPin.trim());
      form.set("dateOfBirth", dateOfBirth);
      form.set("selfieFile", file);
      const [res] = await Promise.all([
        apiFetch<{ result: VerificationResult }>("/api/parent/identity-verification", {
          method: "POST",
          body: form,
        }),
        minDuration,
      ]);
      stopStageTimer();
      setStageIndex(STAGES.length);
      setResult(res.result);
      if (res.result.status === "verified") {
        setExistingResult(res.result);
        // The auth context's cached verificationStatus predates this
        // result — refresh it now so app/parent/layout.tsx's guard
        // already sees "verified" by the time the Continue to CareLink
        // button below is tapped, instead of bouncing back here.
        await refreshVerificationStatus();
      }
      setStep("result");
    } catch (err) {
      stopStageTimer();
      await minDuration;
      setSubmitError(errorMessage(err));
      setStep("pin");
    }
  }

  if (loadingExisting) {
    return <p className="text-[13px] text-ink-muted">Loading…</p>;
  }

  if (existingResult && step === "intro") {
    return <ResultCard result={existingResult} onRetry={startOver} continueHref={continueHref} />;
  }

  if (step === "result" && result) {
    return <ResultCard result={result} onRetry={startOver} continueHref={continueHref} />;
  }

  if (step === "verifying") {
    return <VerifyingCard stageIndex={stageIndex} />;
  }

  if (step === "selfie") {
    return (
      <Sheet className="flex flex-col gap-4">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">
            Step 2 of 2 — Live Photo Verification
          </h3>
          <p className="text-[13px] text-ink-muted">
            Take a live selfie so we can compare it against your Ghana Card photo.
          </p>
        </div>
        <CameraCapture
          onCapture={(f) => void submit(f)}
          onFallback={() => {}}
          showFallback={false}
        />
        <button
          type="button"
          onClick={() => setStep("pin")}
          className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          Back
        </button>
      </Sheet>
    );
  }

  // "pin" (and the initial "intro" when there's no existing result yet)
  return (
    <Sheet as="form" onSubmit={onPinContinue} className="flex flex-col gap-4">
      <div>
        <h3 className="text-[16px] font-semibold text-ink">Step 1 of 2 — Ghana Card PIN</h3>
        <p className="text-[13px] text-ink-muted">
          Identity verification is required to help maintain trust and safety on CareLink.
        </p>
      </div>

      {lastFailure && (
        <p className="rounded-[10px] bg-error-tint px-3 py-2 text-[13px] text-error">
          {lastFailure.failureReason
            ? FAILURE_COPY[lastFailure.failureReason]
            : FAILURE_COPY.incomplete}
        </p>
      )}

      <Field
        label="Ghana Card PIN"
        placeholder="GHA-XXXXXXXXX-X"
        value={ghanaCardPin}
        onChange={(e) => setGhanaCardPin(e.target.value)}
        required
      />
      <Field
        label="Date of Birth"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        required
      />
      {formError && <p className="text-[13px] text-error">{formError}</p>}
      {submitError && <p className="text-[13px] text-error">{submitError}</p>}

      <Button type="submit">Continue</Button>
    </Sheet>
  );
}
