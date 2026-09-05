"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin → Caregivers, redesigned to the current CareLink visual
// language: header-only nav (the admin sidebar was already removed
// project-wide in an earlier pass), a simple roster card per caregiver
// showing only what an agency operator needs at a glance, and a
// dedicated detail page (new — none existed before) for everything
// else. CareLink is an existing agency's platform, not an open
// marketplace: caregivers are agency-trained/approved, never
// CareLink-trained, and pricing is fixed (never a caregiver-set rate),
// so neither appears here.

type RosterEntry = {
  id: string;
  fullName: string;
  phone: string;
  profileComplete: boolean;
  caregiverType: "nanny" | "babysitter" | null;
  completedCareHours: number;
  dispatchAvailable: boolean;
};

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

function AvailabilityDot({ available }: { available: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
      <span
        className={`h-2 w-2 rounded-full ${available ? "bg-[var(--color-success)]" : "bg-ink-muted/40"}`}
        aria-hidden
      />
      {available ? "Available" : "Off Duty"}
    </span>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<{ fullName: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ invitationCode: string }>("/api/admin/staff", {
        method: "POST",
        body: { fullName, phone },
      });
      setIssued({ fullName, code: res.invitationCode });
      setFullName("");
      setPhone("");
      onInvited();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (issued) {
    return (
      <Sheet className="flex flex-col gap-3">
        <p className="text-[15px]">
          {issued.fullName} added to the roster. Share this invitation code with them — it&apos;s
          shown only once.
        </p>
        <p className="text-[28px] font-semibold tracking-[0.1em] tabular-nums">{issued.code}</p>
        <Button variant="secondary" onClick={() => setIssued(null)}>
          Done
        </Button>
      </Sheet>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Invite a caregiver
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Full name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <Field
        label="Phone"
        type="tel"
        placeholder="+233…"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add to roster"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

function CaregiverCard({ entry }: { entry: RosterEntry }) {
  return (
    <Sheet className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar photoUrl={null} name={entry.fullName} size="sm" />
        <div className="flex flex-col gap-1">
          <p className="text-[16px] font-semibold text-ink">{entry.fullName}</p>
          <p className="text-[13px] text-ink-muted">{entry.phone}</p>
          <p className="text-[13px] text-ink-muted">
            {entry.caregiverType ? CAREGIVER_TYPE_LABEL[entry.caregiverType] : "Agency caregiver"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-col sm:items-end sm:gap-1.5">
        <span className="text-[13px] text-ink-muted">
          Profile:{" "}
          <span className="font-medium text-ink">
            {entry.profileComplete ? "Complete" : "Incomplete"}
          </span>
        </span>
        <AvailabilityDot available={entry.dispatchAvailable} />
        <span className="text-[13px] text-ink-muted">
          Completed Care:{" "}
          <span className="font-medium text-ink">{entry.completedCareHours} hours</span>
        </span>
        <Link href={`/admin/roster/${entry.id}`} className="w-full sm:w-auto">
          <Button variant="secondary" className="w-full sm:w-auto">
            View Details
          </Button>
        </Link>
      </div>
    </Sheet>
  );
}

export default function AdminRosterPage() {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function load() {
    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => {
        setError(null);
        setRoster(res.roster);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!roster) return null;
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q),
    );
  }, [roster, query]);

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

      {error && <ErrorState onRetry={load} />}

      <InviteForm onInvited={load} />

      {!error && roster && roster.length > 0 && (
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone"
            aria-label="Search caregivers"
            className="w-full rounded-[10px] border border-hairline bg-sheet py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
          />
        </div>
      )}

      {!error && roster === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && roster?.length === 0 && (
        <EmptyState
          icon={UsersThree}
          title="No caregivers yet"
          description="Invite one to get started."
        />
      )}

      {!error && filtered && filtered.length === 0 && roster && roster.length > 0 && (
        <EmptyState
          icon={MagnifyingGlass}
          title="No caregivers found"
          description="Try a different search."
        />
      )}

      <div className="flex flex-col gap-4">
        {filtered?.map((r) => (
          <CaregiverCard key={r.id} entry={r} />
        ))}
      </div>
    </div>
  );
}
