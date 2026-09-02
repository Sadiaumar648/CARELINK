"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Your password does not meet the required requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateErr } = await getSupabaseClient().auth.updateUser({ password });
      if (updateErr) throw new Error(updateErr.message);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle size={44} weight="fill" className="text-wisteria" />
        <h1 className="text-[24px] font-semibold font-heading">Password updated</h1>
        <p className="text-[15px] text-ink-muted">Your password has been reset.</p>
        <Button onClick={() => router.replace("/sign-in")}>Continue to log in →</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold font-heading">Choose a new password</h1>
      </div>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Reset password →"}
        </Button>
      </Sheet>
    </div>
  );
}
