"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { UserRole } from "@carelink/shared";
import { useAuth } from "@/lib/auth/auth-context";

// The App Flow doc's cross-cutting rules, made concrete: signed out goes to
// sign-in and back again once done; signed in as the wrong role goes to
// their own home, never a raw error.
//
// Render gate is deliberately an exact match — `!loading && !!session &&
// myRole === role` — rather than "not loading and not a known mismatch".
// auth-context.tsx's onAuthStateChange can re-check the role independently
// of the initial getSession() load; if that later check is still in
// flight (or transiently fails) right as `loading` flips false, `myRole`
// can sit at null for a moment. Treating null the same as "no
// restriction" would let `children` render before the role is actually
// confirmed — a real, if narrow, gap. Requiring the exact match closes it:
// any state that isn't definitively "this is the right role" falls
// through to the loading fallback instead.
export function RequireRole({
  role,
  children,
  loadingFallback,
}: {
  // A single role, or a list when the same page is legitimately shared
  // by more than one role — e.g. /onboarding/identity, whose identity
  // verification wizard is reused by both a parent and a caregiver
  // completing onboarding after claim-invitation.
  role: UserRole | UserRole[];
  children: ReactNode;
  // Optional per-role loading UI, shown for the exact same window the
  // default "Loading…" text covers — only Staff currently passes one
  // (a skeleton matching its own dashboard shape); omitting it keeps
  // every other role's fallback pixel-for-pixel unchanged.
  loadingFallback?: ReactNode;
}) {
  const { session, role: myRole, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Keyed off a stable string so a `role={["parent", "staff"]}` array
  // literal (a fresh reference every render) doesn't retrigger the
  // effect below on every render.
  const roleKey = Array.isArray(role) ? role.join(",") : role;
  const allowedRoles = useMemo(() => roleKey.split(","), [roleKey]) as UserRole[];
  const ready = !loading && !!session && !!myRole && allowedRoles.includes(myRole);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (myRole && !allowedRoles.includes(myRole)) {
      router.replace(`/${myRole}`);
    }
  }, [loading, session, myRole, allowedRoles, router, pathname]);

  if (!ready) {
    return (
      loadingFallback ?? (
        <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-ink-muted">
          Loading…
        </div>
      )
    );
  }

  return <>{children}</>;
}
