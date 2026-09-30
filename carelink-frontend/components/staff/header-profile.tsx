"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown, SignOut, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";

// Real initials computed from the authenticated caregiver's own name —
// same helper as components/parent/header-profile.tsx's
// ParentHeaderProfile, never a hardcoded placeholder.
function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The header's avatar/name/chevron cluster for the caregiver role —
// deliberately the SAME two-item structure as the parent dropdown
// (components/parent/header-profile.tsx's ParentHeaderProfile): Settings,
// then Log Out. Settings routes to /staff/profile, the caregiver's one
// combined profile/settings hub page, which is where Help & Support
// lives (Section 14 of the redesign) rather than as its own row here —
// same reasoning Parent already uses for Payment Methods/Help & Support
// living under its own Settings page instead of the dropdown.
export function StaffHeaderProfile() {
  const { user, signOut } = useAuth();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "Account";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1 hover:bg-wisteria-tint"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wisteria text-[13px] font-semibold text-white">
          {initialsFor(fullName)}
        </span>
        <span className="hidden max-w-[120px] truncate text-[13.5px] font-semibold text-ink sm:inline">
          {fullName.split(" ")[0]}
        </span>
        <CaretDown size={14} className="text-ink-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-[14px] border border-[var(--color-lavender-border)] bg-sheet py-1.5 shadow-[var(--shadow-card-hover)]">
          <p className="truncate px-4 py-2 text-[13px] font-semibold text-ink">{fullName}</p>
          <div className="border-y border-[var(--color-lavender-border)]">
            <ThemeToggle />
          </div>
          <Link
            href="/staff/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-[13.5px] text-ink hover:bg-wisteria-tint"
          >
            <UserCircle size={17} /> Settings
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 border-t border-[var(--color-lavender-border)] px-4 py-2 text-left text-[13.5px] text-error hover:bg-error-tint"
          >
            <SignOut size={17} /> Log Out
          </button>
        </div>
      )}
    </div>
  );
}
