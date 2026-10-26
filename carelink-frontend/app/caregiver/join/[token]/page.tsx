"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

// The self-registration counterpart to /register: no identity document
// or photo is collected — only staff the agency has already trained
// and approved ever receive this link, so the link itself is the
// verification. No account exists yet here, so this page is
// unauthenticated by design, same as claim-invitation — and always
// continues straight into /onboarding/caregiver afterward, since a
// caregiver reaching here is always brand new.

const PHONE_RE = /^[+\d][\d\s-]{6,}$/;

type LinkStatus =
  | { checking: true }
  | { checking: false; valid: true; label: string }
  | { checking: false; valid: false; reason: string };

const INVALID_REASON_COPY: Record<string, string> = {
  not_found: "This onboarding link doesn't exist.",
  deactivated: "This onboarding link has been deactivated.",
  expired: "This onboarding link has expired.",
  limit_reached: "This onboarding link has reached its registration limit.",
};

export default function CaregiverJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);
  const [status, setStatus] = useState<LinkStatus>({ checking: true });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ valid: boolean; label?: string; reason?: string }>(`/api/onboarding-links/${token}`)
      .then((res) => {
        setStatus(
          res.valid
            ? { checking: false, valid: true, label: res.label ?? "Agency Caregiver Link" }
            : { checking: false, valid: false, reason: res.reason ?? "not_found" },
        );
      })
      .catch(() => setStatus({ checking: false, valid: false, reason: "not_found" }));
  }, [token]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "Enter your full name.";
    if (!PHONE_RE.test(phone)) errors.phone = "Please enter a valid phone number.";
    if (password.length < 8)
      errors.password = "Your password does not meet the required requirements.";
    if (password !== confirmPassword) errors.confirmPassword = "The passwords don't match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/api/auth/join-onboarding-link",
        {
          method: "POST",
          body: { token, fullName: fullName.trim(), phone: phone.trim(), password },
        },
      );
      const { error: sessionErr } = await getSupabaseClient().auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (sessionErr) throw new Error(sessionErr.message);
      router.replace("/onboarding/caregiver");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  if (status.checking) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!status.valid) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-[22px] font-semibold font-heading">Link not available</h1>
        <p className="text-[14px] text-ink-muted">
          {INVALID_REASON_COPY[status.reason] ?? "This onboarding link isn't available anymore."}{" "}
          Ask CareLink for a new one.
        </p>
        <Link href="/sign-in" className="text-[13px] font-semibold text-wisteria">
          Already have an account? Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold font-heading">Join CareLink as a caregiver</h1>
        <p className="text-[14px] text-ink-muted">
          Your agency shared this link so you can create your own CareLink account.
        </p>
      </div>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Full name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
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
        {error && <p className="text-[13px] text-error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Creating your account…" : "Create Account"}
        </Button>
      </Sheet>
      <p className="text-center text-[13px] text-ink-muted">
        Already claimed?{" "}
        <Link href="/sign-in" className="font-semibold text-wisteria">
          Sign in
        </Link>
      </p>
    </div>
  );
}
