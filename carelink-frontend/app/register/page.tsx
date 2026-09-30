"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;

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

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "Enter your first name.";
    if (!lastName.trim()) errors.lastName = "Enter your last name.";
    if (!EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";
    if (!PHONE_RE.test(phone)) errors.phone = "Please enter a valid phone number.";
    if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword) errors.confirmPassword = "The passwords don't match.";
    if (!agreed) errors.agreed = "Please agree to the Terms of Service and Privacy Policy.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Registration goes through POST /api/auth/register (service-role
  // account creation + a server-side sign-in, the exact same shape
  // /api/auth/claim-invitation already uses) rather than calling
  // supabase.auth.signUp() directly — a self-service sign-up here always
  // returns a real, usable session immediately, regardless of the
  // Supabase project's own "Confirm email" setting or whether its
  // built-in mailer can actually send anything right now. No email
  // step, no code, no separate confirmation screen: setSession below
  // signs the parent in immediately, but the account starts
  // unverified — app/parent/layout.tsx won't let it into the dashboard
  // until /verify-identity succeeds, so this only ever unlocks
  // verification next, never Parent Home.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/api/auth/register",
        {
          method: "POST",
          body: { fullName, phone, email, password },
        },
      );
      const { error: sessionErr } = await getSupabaseClient().auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (sessionErr) throw new Error(sessionErr.message);
      // No live photo or Ghana Card number is collected here — both are
      // step 1 and step 2 of the dedicated Ghana Card verification
      // (components/parent/identity-verification.tsx), which a fresh
      // account goes straight into next, before Home — not asked for
      // twice, and not something the parent has to go find later.
      router.replace("/verify-identity");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <RegisterHeader />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold font-heading">Create your CareLink account</h1>
          <p className="text-[14px] text-ink-muted">
            Fill in your account details. You&apos;ll verify your identity with your Ghana Card
            next, before you can start finding care.
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
            {loading ? "Preparing Verification…" : "Continue to Verification"}
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
          invitation from CareLink to join.
        </p>
      </div>
    </div>
  );
}
