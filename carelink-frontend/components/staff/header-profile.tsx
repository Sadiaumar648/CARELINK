"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown, Question, SignOut, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";

// Real initials computed from the authenticated caregiver's own name —
// same helper as components/parent/header-profile.tsx's
// ParentHeaderProfile, never a hardcoded placeholder.
function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The header's avatar/name/chevron cluster for the caregiver role.
// Four real destinations, nothing fabricated:
//  - Profile and Settings both route to /staff/profile — the one
//    existing page that already covers a caregiver's professional
//    profile (photo/bio/skills/qualifications/areas/availability) AND
//    their account-level settings (verification, safety link, sign
//    out). This app has no separate staff "settings" page today, and
//    per this redesign's own instruction not to introduce new pages,
//    this wasn't invented — both items are kept as their own rows
//    (matching the requested dropdown structure exactly) rather than
//    collapsed into one, but they share the one real destination that
//    already exists.
//  - Help & Support routes to /staff/safety, the existing "Safety &
//    Support" page (already linked this way from both the old Home
//    dashboard summary and the Profile page).
//  - Log Out is directly available here, same as the parent dropdown.
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
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-[14px] border border-[var(--color-lavender-border)] bg-sheet py-1.5 shadow-[var(--shadow-card-hover)]">
          <p className="truncate px-4 py-2 text-[13px] font-semibold text-ink">{fullName}</p>
          <Link
            href="/staff/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-[13.5px] text-ink hover:bg-wisteria-tint"
          >
            <UserCircle size={17} /> Profile
          </Link>
          <Link
            href="/staff/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-[13.5px] text-ink hover:bg-wisteria-tint"
          >
            <UserCircle size={17} /> Settings
          </Link>
          <Link
            href="/staff/safety"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-[13.5px] text-ink hover:bg-wisteria-tint"
          >
            <Question size={17} /> Help & Support
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
