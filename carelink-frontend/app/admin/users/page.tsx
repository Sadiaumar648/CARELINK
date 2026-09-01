"use client";

import { useEffect, useState } from "react";
import { Baby, Plus, UserCircle, UsersThree } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

type Role = "parent" | "caregiver";

type ParentEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  accountStatus: string;
  verificationStatus: string;
  existingAgencyUser: boolean;
  profileComplete: boolean;
  area: string | null;
};

type CaregiverEntry = {
  id: string;
  fullName: string;
  phone: string;
  accountStatus: string;
  verificationStatus: string;
  existingAgencyUser: boolean;
  profileComplete: boolean;
  ratingAvg: number | null;
  bookingsCompleted: number;
  acceptingBookings: boolean;
};

// "Agency Verified" vs plain "Verified" is presentational only — both
// read the exact same verification_status column every other part of
// the app already relies on (the booking-creation gate, the caregiver
// profile badge, etc.). There is no separate "who verified this"
// column, and none is added here — existingAgencyUser (derived from
// the already-existing invited_by column) is only used to choose which
// label to show for an already-verified account, never to change what
// verified actually means.
function verificationLabel(status: string, existingAgencyUser: boolean): string {
  if (status === "verified") return existingAgencyUser ? "✓ Agency Verified" : "✓ Verified";
  if (status === "pending") return "Pending review";
  if (status === "rejected") return "Rejected";
  return "Verification required";
}

const VERIFICATION_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  unverified: "neutral",
  pending: "info",
  verified: "positive",
  rejected: "attention",
};

function OriginTag({ existingAgencyUser }: { existingAgencyUser: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        existingAgencyUser
          ? "bg-bluebell-tint text-[var(--color-bluebell-pressed)]"
          : "bg-sage-tint text-sage-pressed"
      }`}
    >
      {existingAgencyUser ? "Existing agency user" : "New user"}
    </span>
  );
}

// Shared by both the parent and caregiver forms below — same fields,
// same optional email/agency-verified attestation, only the submit
// target (and therefore the account's role) differs. See
// createParentInviteSchema / createStaffInviteSchema for why email and
// agencyVerified are both optional.
function OnboardExistingUserForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [agencyVerified, setAgencyVerified] = useState(false);
  const [issued, setIssued] = useState<{ fullName: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = role === "parent" ? "/api/admin/parents" : "/api/admin/staff";
      const res = await apiFetch<{ invitationCode: string }>(endpoint, {
        method: "POST",
        body: {
          fullName,
          phone,
          email: email.trim() || undefined,
          agencyVerified,
        },
      });
      setIssued({ fullName, code: res.invitationCode });
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
          {issued.fullName} has been added as an existing {role}. Share this invitation code with
          them — it&apos;s shown only once. They&apos;ll use it, their phone number, and a password
          they choose themselves to log in — CareLink never sees or stores that password.
        </p>
        <p className="text-[28px] font-semibold tracking-[0.1em] tabular-nums">{issued.code}</p>
        <Button
          onClick={() => {
            setIssued(null);
            setFullName("");
            setPhone("");
            setEmail("");
            setAgencyVerified(false);
            onDone();
          }}
        >
          Done
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold font-heading">
        Existing {role === "parent" ? "parent" : "caregiver"} details
      </h2>
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
      <Field
        label="Email (optional)"
        type="email"
        placeholder="If the agency already has one on file"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="flex items-start gap-2 rounded-[10px] border border-hairline bg-paper p-3 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={agencyVerified}
          onChange={(e) => setAgencyVerified(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          This person has already been identity-verified by the agency — skip CareLink&apos;s
          document review and mark their account verified immediately.
        </span>
      </label>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        {role === "parent"
          ? "They'll complete their household and ward profile themselves after logging in, the same way any parent does."
          : "They'll complete their profile — bio, rate, skills, service areas, availability — themselves after logging in, the same way any caregiver does."}
      </p>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting || !fullName.trim() || !phone.trim()}>
          {submitting ? "Adding…" : "Create Account & Get Invitation Code"}
        </Button>
      </div>
    </Sheet>
  );
}

function AddExistingUserFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"closed" | "chooseRole" | Role>("closed");

  if (step === "closed") {
    return (
      <Button onClick={() => setStep("chooseRole")}>
        <Plus size={16} weight="bold" /> Add Existing User
      </Button>
    );
  }

  if (step === "chooseRole") {
    return (
      <Sheet className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold font-heading">Who are you onboarding?</h2>
        <p className="text-[13px] text-ink-muted">
          Choose the role for this existing agency client or caregiver.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep("parent")}
            className="flex flex-col items-center gap-2 rounded-[14px] border border-hairline p-6 text-center hover:border-sage hover:bg-sage-tint"
          >
            <UserCircle size={28} className="text-sage" />
            <span className="text-[14px] font-semibold text-ink">Parent</span>
          </button>
          <button
            type="button"
            onClick={() => setStep("caregiver")}
            className="flex flex-col items-center gap-2 rounded-[14px] border border-hairline p-6 text-center hover:border-sage hover:bg-sage-tint"
          >
            <UsersThree size={28} className="text-sage" />
            <span className="text-[14px] font-semibold text-ink">Caregiver</span>
          </button>
        </div>
        <Button variant="secondary" onClick={() => setStep("closed")} className="self-start">
          Cancel
        </Button>
      </Sheet>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <OnboardExistingUserForm
        role={step}
        onDone={() => {
          setStep("closed");
          onDone();
        }}
      />
      <button
        type="button"
        onClick={() => setStep("chooseRole")}
        className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        ← Choose a different role
      </button>
    </div>
  );
}

function ParentsTab() {
  const [parents, setParents] = useState<ParentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<{ parents: ParentEntry[] }>("/api/admin/parents")
      .then((res) => {
        setError(null);
        setParents(res.parents);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorState onRetry={load} />}
      {!error && parents === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}
      {!error && parents?.length === 0 && (
        <EmptyState
          icon={Baby}
          title="No parents yet"
          description="Onboarded parents will appear here."
        />
      )}
      {!error &&
        parents?.map((p) => (
          <Sheet key={p.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {p.fullName}
                <OriginTag existingAgencyUser={p.existingAgencyUser} />
              </p>
              <p className="text-[13px] text-ink-muted">
                {p.phone} · {p.email}
                {p.area ? ` · ${p.area}` : ""}
              </p>
              <p className="text-[12px] text-ink-muted">
                {p.profileComplete ? "Household profile complete" : "Household profile incomplete"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge label={p.accountStatus} />
              <StatusBadge
                label={verificationLabel(p.verificationStatus, p.existingAgencyUser)}
                tone={VERIFICATION_TONE[p.verificationStatus] ?? "neutral"}
              />
            </div>
          </Sheet>
        ))}
    </div>
  );
}

function CaregiversTab() {
  const [caregivers, setCaregivers] = useState<CaregiverEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<{ roster: CaregiverEntry[] }>("/api/admin/roster")
      .then((res) => {
        setError(null);
        setCaregivers(res.roster);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorState onRetry={load} />}
      {!error && caregivers === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}
      {!error && caregivers?.length === 0 && (
        <EmptyState
          icon={UsersThree}
          title="No caregivers yet"
          description="Onboarded caregivers will appear here."
        />
      )}
      {!error &&
        caregivers?.map((c) => (
          <Sheet key={c.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {c.fullName}
                <OriginTag existingAgencyUser={c.existingAgencyUser} />
              </p>
              <p className="text-[13px] text-ink-muted">
                {c.phone} · {c.bookingsCompleted} bookings
                {c.ratingAvg ? ` · ${c.ratingAvg.toFixed(1)}★` : ""}
              </p>
              <p className="text-[12px] text-ink-muted">
                {c.profileComplete ? "Profile complete" : "Profile incomplete"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge label={c.accountStatus} />
              <StatusBadge
                label={verificationLabel(c.verificationStatus, c.existingAgencyUser)}
                tone={VERIFICATION_TONE[c.verificationStatus] ?? "neutral"}
              />
            </div>
          </Sheet>
        ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const [tab, setTab] = useState<"parents" | "caregivers">("parents");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Users</h1>
        <p className="text-[14px] text-ink-muted">
          Every parent and caregiver on the platform, and where they came from.
        </p>
      </div>

      <AddExistingUserFlow onDone={() => setRefreshKey((k) => k + 1)} />

      <div className="flex gap-2">
        {(["parents", "caregivers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
              tab === t
                ? "bg-sage text-sheet"
                : "border border-hairline bg-sheet text-ink-muted hover:text-ink"
            }`}
          >
            {t === "parents" ? "Parents" : "Caregivers"}
          </button>
        ))}
      </div>

      {tab === "parents" ? (
        <ParentsTab key={`parents-${refreshKey}`} />
      ) : (
        <CaregiversTab key={`caregivers-${refreshKey}`} />
      )}
    </div>
  );
}
