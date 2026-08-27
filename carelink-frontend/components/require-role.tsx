"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { UserRole } from "@carelink/shared";
import { useAuth } from "@/lib/auth/auth-context";

// The App Flow doc's cross-cutting rules, made concrete: signed out goes to
// sign-in and back again once done; signed in as the wrong role goes to
// their own home, never a raw error.
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { session, role: myRole, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (myRole && myRole !== role) {
      router.replace(`/${myRole}`);
    }
  }, [loading, session, myRole, role, router, pathname]);

  if (loading || !session || (myRole && myRole !== role)) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-ink-muted">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
