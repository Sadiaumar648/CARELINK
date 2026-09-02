"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@carelink/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

export default function ClaimInvitationPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/api/auth/claim-invitation",
        { method: "POST", body: { code, phone, password } },
      );
      const { error: sessionErr } = await getSupabaseClient().auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (sessionErr) throw new Error(sessionErr.message);

      // This claim flow now also covers an existing agency parent
      // (api/admin/parents issues the same kind of invitation), so the
      // landing page has to follow the role that was actually claimed —
      // this mirrors sign-in/page.tsx's own role-based redirect exactly,
      // including its "no household yet" check for a parent, rather
      // than inventing a second version of that logic here.
      const me = await apiFetch<{ role: UserRole }>("/api/me");
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
      <h1 className="text-[26px] font-semibold font-heading">Claim your invitation</h1>
      <p className="text-[13px] text-ink-muted">
        An administrator added you as a caregiver. Enter the code they gave you and the phone number
        on file to set up your own password.
      </p>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Invitation code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          label="Phone"
          type="tel"
          placeholder="+233…"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Field
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Setting up…" : "Claim account"}
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
