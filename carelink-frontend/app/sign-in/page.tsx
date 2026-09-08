"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EnvelopeSimple, LockKey } from "@phosphor-icons/react";
import type { UserRole } from "@carelink/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

// Logo-only header, local to this page — not the shared PublicNav, so no
// other page is affected by this edit. Mirrors the same pattern already
// used on /register and /get-started.
function SignInHeader() {
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

// No real Privacy/Terms/Help destinations exist anywhere in the app yet
// (the public landing page's own footer links Privacy/Terms to the same
// "#" placeholder) — these three match that existing precedent rather
// than invent new pages.
function SignInFooter() {
  return (
    <footer className="flex items-center justify-center gap-3 px-6 py-6 text-[12.5px] text-ink-muted">
      <a href="#" className="hover:text-ink">
        Privacy Policy
      </a>
      <span aria-hidden>·</span>
      <a href="#" className="hover:text-ink">
        Terms of Service
      </a>
      <span aria-hidden>·</span>
      <a href="#" className="hover:text-ink">
        Help
      </a>
    </footer>
  );
}

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

      router.replace(`/${me.role}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <SignInHeader />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
        <Sheet className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] font-semibold font-heading">Welcome back</h1>
            <p className="text-[14px] text-ink-muted">
              Sign in to continue to your CareLink account.
            </p>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              icon={EnvelopeSimple}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                icon={LockKey}
                showPasswordToggle
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
            <Button type="submit" disabled={loading} className="w-full justify-center">
              {loading ? "Signing in…" : "Log In"}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-hairline" aria-hidden />
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              or
            </span>
            <div className="h-px flex-1 bg-hairline" aria-hidden />
          </div>

          <p className="text-center text-[13px] text-ink-muted">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-wisteria hover:text-wisteria-hover"
            >
              Create one
            </Link>
          </p>

          <div className="flex flex-col gap-1 rounded-[12px] bg-wisteria-tint/60 p-4 text-center">
            <p className="text-[13px] font-semibold text-ink">Joining as a caregiver?</p>
            <p className="text-[12.5px] text-ink-muted">
              Use the invitation link provided by your agency.
            </p>
            <Link
              href="/claim-invitation"
              className="mt-1 text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              Claim your caregiver account
            </Link>
          </div>
        </Sheet>
      </div>
      <SignInFooter />
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
