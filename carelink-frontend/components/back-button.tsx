"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";

// A single, universal "go back to wherever I just was" control, shown in
// the app header on every page except a role's own home. It steps back
// through real browser history — so it always returns to the exact page
// the person came from, regardless of how they got here (a link, a
// notification, a deep link they were sent) — and only falls back to the
// role home when this tab has no in-app history to step into (a fresh
// deep link opened in a new tab). The per-page "Back to Settings" /
// "Back to Home" links elsewhere are unaffected; they're logical
// shortcuts to a section parent, a different thing from this.
export function BackButton({ homeHref }: { homeHref: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // On a role's home there's nothing "before you entered this page"
  // inside the app — nothing to go back to.
  if (pathname === homeHref) return null;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(homeHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      className="flex shrink-0 items-center gap-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold text-ink-muted hover:bg-hairline/40 hover:text-ink"
    >
      <ArrowLeft size={18} />
      <span className="hidden sm:inline">Back</span>
    </button>
  );
}
