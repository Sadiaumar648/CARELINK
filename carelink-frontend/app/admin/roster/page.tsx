"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

type RosterEntry = {
  id: string;
  fullName: string;
  phone: string;
  accountStatus: string;
  verificationStatus: string;
  profileComplete: boolean;
  ratingAvg: number | null;
  bookingsCompleted: number;
  acceptingBookings: boolean;
};

const VERIFICATION_TONE: Record<string, "neutral" | "positive" | "attention"> = {
  unverified: "neutral",
  pending: "neutral",
  verified: "positive",
  rejected: "attention",
};

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
      <Button variant="secondary" onClick={() => setOpen(true)}>
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Roster</h1>
        <p className="text-[14px] text-ink-muted">Every caregiver on the platform.</p>
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
            className="w-full rounded-[10px] border border-hairline bg-sheet py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none focus:ring-4 focus:ring-sage/15"
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
          <Sheet key={r.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[17px] font-semibold">{r.fullName}</p>
              <p className="text-[13px] text-ink-muted">
                {r.phone} · {r.bookingsCompleted} bookings
                {r.ratingAvg ? ` · ${r.ratingAvg.toFixed(1)}★` : ""}
              </p>
              <p className="text-[12px] text-ink-muted">
                {r.profileComplete ? "Profile complete" : "Profile incomplete"} ·{" "}
                {r.acceptingBookings ? "Accepting bookings" : "Not accepting bookings"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge label={r.accountStatus} />
              <StatusBadge
                label={r.verificationStatus}
                tone={VERIFICATION_TONE[r.verificationStatus] ?? "neutral"}
              />
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}
