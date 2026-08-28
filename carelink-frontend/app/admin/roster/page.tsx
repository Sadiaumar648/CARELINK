"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";

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

  function load() {
    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => setRoster(res.roster))
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Roster</h1>
      {error && <p className="text-[13px] text-error">{error}</p>}

      <InviteForm onInvited={load} />

      {roster === null && <p className="text-[13px] text-ink-muted">Loading…</p>}

      <div className="flex flex-col gap-4">
        {roster?.map((r) => (
          <Sheet key={r.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[17px] font-semibold">{r.fullName}</p>
              <p className="text-[13px] text-ink-muted">
                {r.phone} · {r.bookingsCompleted} bookings
                {r.ratingAvg ? ` · ${r.ratingAvg.toFixed(1)}★` : ""}
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
