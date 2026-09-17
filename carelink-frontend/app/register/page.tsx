"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/camera-capture";
import { PENDING_VERIFICATION_KEY } from "@/lib/pending-verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;
const MAX_LIVE_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone selfie/upload.

// Logo-only header, local to this page — not the shared PublicNav, so no
// other page is affected by this edit. This is the public homepage's
// "Get Started" button's direct destination; there's no separate
// Get Started choice page anymore.
function RegisterHeader() {
  return (
    <header className="border-b border-hairline bg-sheet/95 px-6 py-4">
      <Link
        href="/"
        className="text-[19px] font-semibold font-heading text-wisteria-pressed transition-colors hover:text-wisteria"
      >
        CareLink
      </Link>
    </header>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [livePhoto, setLivePhoto] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // A fresh object URL per selected file, computed during render rather
  // than via setState-in-an-effect — revoked in the cleanup-only effect
  // below whenever it changes or the page unmounts, so switching/removing
  // photos never leaks object URLs.
  const livePhotoPreview = useMemo(
    () => (livePhoto ? URL.createObjectURL(livePhoto) : null),
    [livePhoto],
  );
  useEffect(() => {
    return () => {
      if (livePhotoPreview) URL.revokeObjectURL(livePhotoPreview);
    };
  }, [livePhotoPreview]);

  function onLivePhotoChange(file: File | null) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.livePhoto;
      return next;
    });
    if (!file) {
      setLivePhoto(null);
      return;
    }
    if (file.size > MAX_LIVE_PHOTO_BYTES) {
      setFieldErrors((prev) => ({
        ...prev,
        livePhoto: "That photo is too large — try one under 8MB.",
      }));
      return;
    }
    setLivePhoto(file);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "Enter your first name.";
    if (!lastName.trim()) errors.lastName = "Enter your last name.";
    if (!EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";
    if (!PHONE_RE.test(phone)) errors.phone = "Please enter a valid phone number.";
    if (!livePhoto) errors.livePhoto = "Add a live photo of your face.";
    if (password.length < 8)
      errors.password = "Your password does not meet the required requirements.";
    if (password !== confirmPassword) errors.confirmPassword = "The passwords don't match.";
    if (!agreed) errors.agreed = "Please agree to the Terms of Service and Privacy Policy.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Identity verification itself is never done here — a Ghana Card is
  // verified later, once the parent has a real session, either through
  // the dedicated NIA/IVSP simulation
  // (components/parent/identity-verification.tsx) or the existing
  // /onboarding/identity wizard (real ID-document upload, reference
  // contact, admin review) — registration no longer asks for a Ghana
  // Card ID number itself, only the live photo. signUp() returns no
  // session while email confirmation is required (the live default for
  // this project — confirmed separately), so there is no authenticated
  // request this page could honestly make yet. What it CAN do without
  // fabricating anything: hand the live photo the parent already gave us
  // to /onboarding/identity, so it can pre-fill it instead of asking
  // again. Best-effort and disposable — never something the actual
  // verification decision depends on, and /onboarding/identity clears it
  // the moment it's read.
  async function stashPendingVerification() {
    if (!livePhoto) return;
    try {
      const livePhotoDataUrl = await fileToDataUrl(livePhoto);
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({
          livePhotoDataUrl,
          livePhotoName: livePhoto.name,
          livePhotoType: livePhoto.type,
        }),
      );
    } catch {
      // Storage full/unavailable, or the photo was too large to encode —
      // never block registration over this. The parent simply re-adds
      // their live photo at /onboarding/identity, same as anyone else.
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { data, error: signUpErr } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: { role: "parent", full_name: fullName, phone },
        },
      });
      if (signUpErr) throw new Error(signUpErr.message);
      await stashPendingVerification();
      // Their live photo is still waiting in sessionStorage whenever they
      // later complete identity verification at /onboarding/identity —
      // never auto-submitted, since that still requires the ID-card
      // photo, a Ghana Card number, and a reference contact this page
      // never collected. There is no approval/review step of any kind
      // here — a parent goes straight to Parent Home the moment they have
      // a real session: immediately if email confirmation is off, or the
      // instant they confirm and log in if it's on (sign-in already sends
      // every role straight to /{role}, with no intermediate screen).
      if (data.session) router.replace("/parent");
      else setCheckEmail(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Supabase's "Confirm signup" email template sends a real 6-digit
  // code (the same {{ .Token }} it always generates — only the template
  // content changed to show it instead of the confirmation link).
  // verifyOtp with type "signup" is the exact same confirmation the old
  // link performed, just entered here instead of clicked — on success it
  // returns a real session immediately, same as clicking the link would
  // have handed back to /sign-in.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setVerifyError("Enter the code we sent you.");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const { data, error: verifyErr } = await getSupabaseClient().auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      if (verifyErr) throw new Error(verifyErr.message);
      if (!data.session)
        throw new Error("Verification succeeded, but signing you in failed — try logging in.");
      router.replace("/parent");
    } catch (err) {
      setVerifyError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  async function resendCode() {
    setResending(true);
    setResendMessage(null);
    setVerifyError(null);
    try {
      const { error: resendErr } = await getSupabaseClient().auth.resend({
        type: "signup",
        email,
      });
      if (resendErr) throw new Error(resendErr.message);
      setResendMessage("We sent you a new code.");
    } catch (err) {
      setVerifyError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="flex flex-1 flex-col">
        <RegisterHeader />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <CheckCircle size={44} weight="fill" className="text-wisteria" />
          <h1 className="text-[24px] font-semibold font-heading">Check your email</h1>
          <p className="text-[15px] text-ink-muted">
            We sent a verification code to <strong className="text-ink">{email}</strong>. Enter it
            below to confirm your account.
          </p>
          <Sheet as="form" onSubmit={verifyCode} className="flex w-full flex-col gap-3 text-left">
            <Field
              label="Verification code"
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={verifyError ?? undefined}
            />
            <Button type="submit" disabled={verifying}>
              {verifying ? "Verifying…" : "Verify and Continue"}
            </Button>
          </Sheet>
          {resendMessage && <p className="text-[13px] text-wisteria-pressed">{resendMessage}</p>}
          <button
            type="button"
            onClick={() => void resendCode()}
            disabled={resending}
            className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover disabled:opacity-50"
          >
            {resending ? "Sending…" : "Didn't get a code? Resend"}
          </button>
          <Link href="/sign-in" className="font-semibold text-wisteria hover:text-wisteria-hover">
            Already verified? Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <RegisterHeader />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold font-heading">Create your CareLink account</h1>
          <p className="text-[14px] text-ink-muted">
            Let&apos;s get you set up so you can find trusted childcare for your family.
          </p>
        </div>
        <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              error={fieldErrors.firstName}
            />
            <Field
              label="Last name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              error={fieldErrors.lastName}
            />
          </div>
          <Field
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />
          <Field
            label="Phone number"
            type="tel"
            placeholder="+233…"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
          />
          <div className="flex flex-col gap-2">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Live photo <span aria-hidden>*</span>
            </label>
            {livePhoto && livePhotoPreview ? (
              <div className="flex items-center gap-3 rounded-[10px] border border-hairline bg-sheet p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a transient local object URL, not a static/remote asset */}
                <img
                  src={livePhotoPreview}
                  alt="Your captured live photo"
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-ink">Photo captured</p>
                </div>
                <button
                  type="button"
                  onClick={() => onLivePhotoChange(null)}
                  className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                >
                  Retake
                </button>
              </div>
            ) : (
              <div className="rounded-[14px] border-2 border-dashed border-hairline bg-sheet px-6 py-8">
                <p className="mb-4 text-center text-[12px] text-ink-muted">
                  Take a clear photo of your face
                </p>
                <CameraCapture
                  onCapture={onLivePhotoChange}
                  onFallback={() => {}}
                  showFallback={false}
                />
              </div>
            )}
            {fieldErrors.livePhoto && (
              <p className="text-[13px] text-error">{fieldErrors.livePhoto}</p>
            )}
          </div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
          />
          <label className="flex items-start gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            I agree to CareLink&apos;s Terms of Service and Privacy Policy.
          </label>
          {fieldErrors.agreed && <p className="text-[13px] text-error">{fieldErrors.agreed}</p>}
          {error && <p className="text-[13px] text-error">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating your account…" : "Create Account"}
          </Button>
        </Sheet>
        <p className="text-center text-[13px] text-ink-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-wisteria hover:text-wisteria-hover">
            Log in
          </Link>
        </p>
        <p className="text-center text-[13px] text-ink-muted">
          <span className="font-semibold text-ink">Are you a caregiver?</span> You&apos;ll need an
          invitation from your agency to join CareLink.
        </p>
      </div>
    </div>
  );
}
