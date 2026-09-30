"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Baby, DotsThreeVertical, MagnifyingGlass } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin → Parents, matching the Caregivers directory's visual language.
// This page previously combined Parents and Caregivers in one tabbed
// view — caregiver management now lives entirely on /admin/roster (its
// own "Invite a caregiver" affordance), so this page is Parents-only.
// The "Add Existing Parent" invite flow (email, agency reference,
// agency-verified attestation — the same real POST /api/admin/parents)
// has been removed from this page per explicit instruction; the
// backend route itself is untouched, so it's still reachable if a
// future entry point needs it.
//
// Test/legacy exclusion: same email-suffix rule already used on the
// Caregivers directory (mirroring the existing public_caregivers
// view's own test-account exclusion) — applied client-side here too,
// since GET /api/admin/parents deliberately still returns every real
// row for other admin-oversight consumers.
//
// Demo display cap: capped at 3 real parents, per explicit instruction
// for the current demo phase — a display-only slice after filtering,
// not a backend limit.
const TEST_EMAIL_SUFFIXES = ["@example.com", "@carelink.invite", "@carelink.seed"];
const DEMO_MAX_PARENTS = 3;

const AVATAR_TINTS = [
  "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
  "bg-wisteria-tint text-wisteria-pressed",
  "bg-success-tint text-[var(--color-success)]",
  "bg-gold-tint text-[var(--color-gold)]",
];

type ParentEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  // The parent's own live identity-verification selfie, as a
  // short-lived signed URL from GET /api/admin/parents — null once
  // there's no submission with a selfie still on file (never verified,
  // or the 30-day retention purge already ran).
  photoUrl: string | null;
  accountStatus: string;
  parentProfileId: string | null;
  bookingCount: number;
  createdAt: string;
};

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ActionMenu({ entry, onChanged }: { entry: ParentEntry; onChanged: () => void }) {
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
        <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-[12px] border border-hairline bg-sheet py-1 shadow-[var(--shadow-card-hover)]">
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

function ParentRow({
  entry,
  avatarTint,
  onChanged,
}: {
  entry: ParentEntry;
  avatarTint: string;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-hairline p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between md:p-5">
      <div className="flex items-center gap-3.5">
        {entry.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed storage URL, not a static asset
          <img
            src={entry.photoUrl}
            alt={entry.fullName}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${avatarTint}`}
          >
            {initialsFor(entry.fullName)}
          </span>
        )}
        <p className="text-[15px] font-semibold text-ink">{entry.fullName}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:flex-nowrap">
        <div className="flex flex-col gap-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Joined
          </p>
          <span className="text-[13.5px] font-medium text-ink">{formatDate(entry.createdAt)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/admin/users/${entry.id}`}>
            <Button variant="secondary">View Details ({entry.bookingCount})</Button>
          </Link>
          <ActionMenu entry={entry} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [parents, setParents] = useState<ParentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  function load() {
    apiFetch<{ parents: ParentEntry[] }>("/api/admin/parents")
      .then((res) => {
        setError(null);
        setParents(res.parents);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [retryKey]);

  const eligible = useMemo(() => {
    if (!parents) return null;
    return parents.filter((p) => !TEST_EMAIL_SUFFIXES.some((suffix) => p.email.endsWith(suffix)));
  }, [parents]);

  const filtered = useMemo(() => {
    if (!eligible) return null;
    const q = query.trim().toLowerCase();
    const matching = q ? eligible.filter((p) => p.fullName.toLowerCase().includes(q)) : eligible;
    return matching.slice(0, DEMO_MAX_PARENTS);
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
        <h1 className="text-[26px] font-semibold font-heading text-ink">Parents</h1>
        <p className="text-[14px] text-ink-muted">Manage the agency&rsquo;s parents.</p>
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
            placeholder="Search parents by name"
            aria-label="Search parents"
            className="w-full rounded-[12px] border border-hairline bg-sheet py-3 pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
          />
        </div>
      )}

      {!error && parents === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && parents && (
        <div className="overflow-hidden rounded-[16px] border border-hairline bg-sheet">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 className="text-[16px] font-semibold text-ink">Parent Directory</h2>
            <span className="text-[13px] font-medium text-wisteria">
              {filtered?.length ?? 0} parent{filtered?.length === 1 ? "" : "s"}
            </span>
          </div>

          {filtered && filtered.length === 0 && (
            <div className="p-8">
              <EmptyState
                icon={Baby}
                title="No parents yet"
                tone="bluebell"
                description="Parents who register with CareLink will appear here."
              />
            </div>
          )}

          {filtered?.map((p, i) => (
            <ParentRow
              key={p.id}
              entry={p}
              avatarTint={AVATAR_TINTS[i % AVATAR_TINTS.length]}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
