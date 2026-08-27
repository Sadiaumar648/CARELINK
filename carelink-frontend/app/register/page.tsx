"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signUpErr } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: { role: "parent", full_name: fullName, phone },
        },
      });
      if (signUpErr) throw new Error(signUpErr.message);
      // If email confirmation is required, signUp succeeds but returns no
      // session — there's nothing to route into yet.
      if (data.session) router.replace("/parent");
      else setCheckEmail(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-[26px] font-semibold">Check your email</h1>
        <p className="text-[15px] text-ink-muted">
          We sent a confirmation link to {email}. Follow it, then come back and sign in.
        </p>
        <Link href="/sign-in" className="font-semibold text-cyan">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Create a parent account</h1>
      <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Full name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
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
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-magenta">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </Sheet>
      <p className="text-center text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-cyan">
          Sign in
        </Link>
      </p>
    </div>
  );
}
