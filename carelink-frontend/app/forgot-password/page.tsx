"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: resetErr } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetErr) throw new Error(resetErr.message);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle size={44} weight="fill" className="text-sage" />
        <h1 className="text-[24px] font-semibold font-heading">Check your email</h1>
        <p className="text-[15px] text-ink-muted">
          If an account exists for <strong className="text-ink">{email}</strong>, we&apos;ve sent a
          link to reset your password.
        </p>
        <Link href="/sign-in" className="font-semibold text-sage hover:text-sage-hover">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold font-heading">Reset your password</h1>
        <p className="text-[14px] text-ink-muted">
          Enter the email on your account and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="text-[13px] text-error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link →"}
        </Button>
      </Sheet>
      <p className="text-center text-[13px] text-ink-muted">
        <Link href="/sign-in" className="font-semibold text-sage hover:text-sage-hover">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
