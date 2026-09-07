"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, DotsThreeVertical, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin → Caregivers, a compact, scannable directory matching the
// approved reference. "Generate Caregiver Onboarding Link" was removed
// from this page — that action now lives only on its own dedicated
// /admin/onboarding-link page, not duplicated here.
//
// Test/legacy exclusion: GET /api/admin/roster deliberately returns
// every real staff_profiles row, unfiltered — that's correct for admin
// oversight generally (the roster detail page, other consumers), so
// it isn't changed here. This page instead reuses the exact same
// email-suffix rule the existing public_caregivers view already
// applies to distinguish real accounts from Jest/seed test data
// (migration 20260901000000_exclude_test_accounts_from_public_caregivers.sql):
// @example.com, @carelink.invite, @carelink.seed are excluded,
// client-side, for this directory's display only.
//
// Demo display cap: capped at 3 real caregivers here, per explicit
// instruction for the current demo phase — not a backend limit, a
// display-only slice applied after the real filtering above.
const TEST_EMAIL_SUFFIXES = ["@example.com", "@carelink.invite", "@carelink.seed"];
const DEMO_MAX_CAREGIVERS = 3;

type RosterEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  accountStatus: string;
  staffProfileId: string | null;
  profileComplete: boolean;
  caregiverType: "nanny" | "babysitter" | null;
  completedCareHours: number;
  acceptingBookings: boolean;
  dispatchAvailable: boolean;
};

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

// A small rotating set of pastel avatar accents, drawn only from
// CareLink's existing palette tokens — assigned by row position so the
// same caregiver always gets the same color across reloads, purely
// presentational (matches the reference's varied avatar colors).
const AVATAR_TINTS = [
  "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
  "bg-wisteria-tint text-wisteria-pressed",
  "bg-success-tint text-[var(--color-success)]",
  "bg-gold-tint text-[var(--color-gold)]",
];

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusDot({ tone, label }: { tone: "positive" | "attention" | "neutral"; label: string }) {
  const dotClass =
    tone === "positive"
      ? "bg-[var(--color-success)]"
      : tone === "attention"
        ? "bg-[var(--color-gold)]"
        : "bg-ink-muted/50";
  return (
    <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  );
}

function MiniColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function ActionMenu({ entry, onChanged }: { entry: RosterEntry; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suspended = entry.accountStatus === "suspended";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function setAccountStatus(status: "active" | "suspended") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${entry.id}/status`, {
        method: "PATCH",
        body: { accountStatus: status },
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function setAcceptingBookings(accepting: boolean) {
    if (!entry.staffProfileId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/roster/${entry.staffProfileId}`, {
        method: "PATCH",
        body: { acceptingBookings: accepting },
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-[12px] border border-hairline bg-sheet py-1 shadow-[var(--shadow-card-hover)]">
          {!suspended && entry.staffProfileId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setAcceptingBookings(!entry.acceptingBookings)}
              className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-ink hover:bg-wisteria-tint"
            >
              {entry.acceptingBookings ? "Pause New Requests" : "Resume New Requests"}
            </button>
          )}
          {suspended ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setAccountStatus("active")}
              className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-ink hover:bg-wisteria-tint"
            >
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setAccountStatus("suspended")}
              className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-error hover:bg-error-tint"
            >
              Suspend
            </button>
          )}
          {error && <p className="px-3.5 py-1.5 text-[12px] text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function CaregiverRow({
  entry,
  avatarTint,
  onChanged,
}: {
  entry: RosterEntry;
  avatarTint: string;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-hairline p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between md:p-5">
      <div className="flex items-center gap-3.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${avatarTint}`}
        >
          {initialsFor(entry.fullName)}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-[15px] font-semibold text-ink">{entry.fullName}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink-muted">{entry.phone}</span>
            {entry.caregiverType && (
              <span className="rounded-full bg-[var(--color-lavender-bg)] px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                {CAREGIVER_TYPE_LABEL[entry.caregiverType]}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:flex-nowrap">
        <MiniColumn label="Profile">
          <StatusDot
            tone={entry.profileComplete ? "positive" : "attention"}
            label={entry.profileComplete ? "Complete" : "Incomplete"}
          />
        </MiniColumn>
        <MiniColumn label="Availability">
          <StatusDot
            tone={entry.dispatchAvailable ? "positive" : "neutral"}
            label={entry.dispatchAvailable ? "Available" : "Off Duty"}
          />
        </MiniColumn>
        <MiniColumn label="Completed Care">
          <span className="text-[13.5px] font-medium text-ink">
            {entry.completedCareHours} hours
          </span>
        </MiniColumn>

        <div className="flex items-center gap-2">
          <Link href={`/admin/roster/${entry.id}`}>
            <Button variant="secondary">View Details</Button>
          </Link>
          <ActionMenu entry={entry} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

export default function AdminRosterPage() {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  function load() {
    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => {
        setError(null);
        setRoster(res.roster);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [retryKey]);

  const eligible = useMemo(() => {
    if (!roster) return null;
    return roster.filter((r) => !TEST_EMAIL_SUFFIXES.some((suffix) => r.email.endsWith(suffix)));
  }, [roster]);

  const displayed = useMemo(() => {
    if (!eligible) return null;
    const q = query.trim().toLowerCase();
    const matching = q
      ? eligible.filter(
          (r) => r.fullName.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q),
        )
      : eligible;
    return matching.slice(0, DEMO_MAX_CAREGIVERS);
  }, [eligible, query]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading text-ink">Caregivers</h1>
        <p className="text-[14px] text-ink-muted">
          Manage agency caregivers, onboarding and availability.
        </p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && (
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search caregivers by name or phone"
            aria-label="Search caregivers"
            className="w-full rounded-[12px] border border-hairline bg-sheet py-3 pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
          />
        </div>
      )}

      {!error && roster === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && roster && (
        <div className="overflow-hidden rounded-[16px] border border-hairline bg-sheet">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 className="text-[16px] font-semibold text-ink">Caregiver Directory</h2>
            <span className="text-[13px] font-medium text-wisteria">
              {displayed?.length ?? 0} caregiver{displayed?.length === 1 ? "" : "s"}
            </span>
          </div>

          {displayed && displayed.length === 0 && (
            <div className="p-8">
              <EmptyState
                icon={UsersThree}
                title="No caregivers yet"
                description="Caregivers who register with your agency will appear here."
                tone="bluebell"
                action={
                  <p className="max-w-xs text-[13px] text-ink-muted">
                    Use the onboarding link to invite caregivers to join your agency.
                  </p>
                }
              />
            </div>
          )}

          {displayed &&
            displayed.map((r, i) => (
              <CaregiverRow
                key={r.id}
                entry={r}
                avatarTint={AVATAR_TINTS[i % AVATAR_TINTS.length]}
                onChanged={load}
              />
            ))}
        </div>
      )}
    </div>
  );
}
