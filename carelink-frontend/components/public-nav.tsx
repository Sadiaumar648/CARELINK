"use client";

import Link from "next/link";
import { Sun, Moon } from "@phosphor-icons/react";
import { LinkButton } from "@/components/ui/button";
import { useTheme } from "@/lib/theme/theme-context";

// A single compact icon button rather than the segmented Light/Dark
// control used inside an authenticated profile dropdown
// (components/theme-toggle.tsx) — that control's label and two-option
// layout doesn't fit this header's one-row, icon-only minimal direction.
function ThemeIconToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-paper hover:text-ink"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// Simplified, minimal public header: logo on the left, Log in / Get
// Started on the right — no navigation links. Previously listed Home,
// Find Care, How It Works, Safety, About and Become a Caregiver here;
// removed per the finalized minimal header direction. No mobile menu is
// needed anymore since there's nothing left to collapse — both actions
// stay visible at every width.
export function PublicNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-sheet/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="text-[19px] font-semibold font-heading text-wisteria-pressed">
          CareLink
        </a>

        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeIconToggle />
          <Link
            href="/sign-in"
            className="px-2 text-[14px] font-semibold text-ink hover:text-wisteria"
          >
            Log in
          </Link>
          <LinkButton href="/register" size="default">
            Get Started
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
