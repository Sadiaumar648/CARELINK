"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { UserRole } from "@carelink/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";

type AuthState = {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  // The signed-in parent's identity-verification status ("verified",
  // "unverified", etc. — see /api/me), fetched alongside role so
  // app/parent/layout.tsx can gate the dashboard without a second
  // request. Null for a signed-out user or a non-parent role that
  // doesn't care about it.
  verificationStatus: string | null;
  // True until the initial session check (and, if signed in, the role
  // lookup) has settled — screens gate their first render on this rather
  // than flashing a signed-out state while Supabase restores the session.
  loading: boolean;
  signOut: () => Promise<void>;
  // Re-fetches /api/me and updates role/verificationStatus without a
  // full session reload. Needed because those only otherwise refresh on
  // sign-in/sign-out/token-refresh — a parent who just completed
  // /verify-identity has a server-side verification_status of
  // "verified" already, but this context wouldn't know that until the
  // next auth event, so app/parent/layout.tsx's guard would bounce them
  // straight back. Called right after a successful verification.
  refreshVerificationStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function loadRole(nextSession: Session | null) {
      if (!nextSession) {
        if (!cancelled) {
          setRole(null);
          setVerificationStatus(null);
        }
        return;
      }
      try {
        const me = await apiFetch<{ id: string; role: UserRole; verificationStatus: string }>(
          "/api/me",
        );
        if (!cancelled) {
          setRole(me.role);
          setVerificationStatus(me.verificationStatus);
        }
      } catch {
        if (!cancelled) {
          setRole(null);
          setVerificationStatus(null);
        }
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadRole(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      void loadRole(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
  }

  // useCallback with no deps: a stable reference, safe to list in a
  // caller's own useEffect dependency array without retriggering it.
  const refreshVerificationStatus = useCallback(async () => {
    try {
      const me = await apiFetch<{ id: string; role: UserRole; verificationStatus: string }>(
        "/api/me",
      );
      setRole(me.role);
      setVerificationStatus(me.verificationStatus);
    } catch {
      // Leave existing state as-is — a transient failure here shouldn't
      // knock a verified parent back to unverified.
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        verificationStatus,
        loading,
        signOut,
        refreshVerificationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
