"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@carelink/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInErr } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) throw new Error(signInErr.message);

      const me = await apiFetch<{ role: UserRole }>("/api/me");
      const next = searchParams.get("next");
      if (next && next.startsWith(`/${me.role}`)) {
        router.replace(next);
        return;
      }

      // A parent who has never completed their household setup hasn't
      // finished onboarding yet — send them back into it rather than the
      // dashboard. Any parent who already has a household row has been
      // through this before and goes straight in, same as always.
      if (me.role === "parent") {
        try {
          const { household } = await apiFetch<{ household: unknown }>("/api/parents/household");
          if (!household) {
            router.replace("/onboarding/identity");
            return;
          }
        } catch {
          // fall through to the normal dashboard redirect
        }
      }
      router.replace(`/${me.role}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold font-heading">Welcome back</h1>
        <p className="text-[14px] text-ink-muted">Log in to continue to CareLink.</p>
      </div>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link
            href="/forgot-password"
            className="self-end text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
          >
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-[13px] text-error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Log In →"}
        </Button>
      </Sheet>
      <p className="text-center text-[13px] text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-wisteria hover:text-wisteria-hover">
          Create one
        </Link>
        {" · "}
        Invited caregiver?{" "}
        <Link
          href="/claim-invitation"
          className="font-semibold text-wisteria hover:text-wisteria-hover"
        >
          Claim your account
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
