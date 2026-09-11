"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Baby,
  CalendarCheck,
  CaretRight,
  LockKey,
  PencilSimple,
  Question,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { VerificationForm } from "@/components/verification-form";

function MenuRow({
  icon: IconComponent,
  label,
  href,
}: {
  icon: typeof Baby;
  label: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 text-ink hover:bg-paper">
        <span className="flex items-center gap-3 text-[14px] font-medium">
          <IconComponent size={20} className="text-wisteria" />
          {label}
        </span>
        <CaretRight size={16} className="text-ink-muted" />
      </div>
    </Link>
  );
}

// The parent's account-level personal info lives entirely in Supabase
// Auth's own user_metadata (full_name, phone) — the same place
// ParentHeaderProfile and every other reader of this data already
// pulls it from. Saving here calls supabase.auth.updateUser() directly
// (the exact call app/reset-password/page.tsx already uses for
// password), never a new backend route or a second profile record —
// updateUser's own USER_UPDATED event refreshes AuthProvider's session
// automatically, so the page reflects the change immediately with no
// manual refetch. Email is deliberately never editable here: changing
// an auth email is a security-sensitive flow (confirmation to both the
// old and new address) that doesn't exist anywhere in this app yet —
// showing an editable field for it would be pretending a flow exists
// that doesn't, so it stays read-only with a short explanation instead.
// The parent's profile photo is their own live selfie from Identity
// Verification below — there's no separate upload here, the same way
// there's no separate "profile photo" concept for a parent anywhere
// else in this app. It's fetched as a short-lived signed URL (the
// storage bucket is private); once the retention job purges the
// underlying image (30 days after a decision), this naturally goes
// back to no photo, matching that existing policy rather than
// overriding it — see GET /api/verification/submissions.
function ProfilePhoto() {
  const { user } = useAuth();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "Your photo";
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<{ photoUrl: string | null }>("/api/verification/submissions")
      .then((res) => setPhotoUrl(res.photoUrl))
      .catch(() => setPhotoUrl(null));
  }, []);

  return (
    <div className="flex items-center gap-4">
      <Avatar photoUrl={photoUrl ?? null} name={fullName} size="md" />
      <p className="text-[12.5px] text-ink-muted">
        {photoUrl
          ? "From the selfie you took to verify your identity."
          : "Verify your identity below to add a photo."}
      </p>
    </div>
  );
}

function PersonalInformationSection() {
  const { user } = useAuth();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const phone = (user?.user_metadata?.phone as string | undefined) ?? "";

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(fullName);
  const [phoneInput, setPhoneInput] = useState(phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function startEditing() {
    setNameInput(fullName);
    setPhoneInput(phone);
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setError("Enter your full name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await getSupabaseClient().auth.updateUser({
        data: { full_name: nameInput.trim(), phone: phoneInput.trim() || undefined },
      });
      if (updateErr) throw new Error(updateErr.message);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Sheet as="form" onSubmit={save} className="flex flex-col gap-4">
        <Field
          label="Full name"
          required
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
        />
        <Field
          label="Phone (optional)"
          type="tel"
          placeholder="+233…"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Email
          </span>
          <p className="text-[14px] text-ink-muted">{user?.email}</p>
          <p className="text-[12px] text-ink-muted">
            Email can&apos;t be changed here — contact support if you need to update it.
          </p>
        </div>
        {error && <p className="text-[13px] text-error">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {fullName && <p className="text-[15px] font-semibold">{fullName}</p>}
        <p className="text-[14px] text-ink">{user?.email}</p>
        {phone && <p className="text-[14px] text-ink-muted">{phone}</p>}
      </div>
      {saved && <p className="text-[13px] text-wisteria-pressed">Saved.</p>}
      <Button variant="secondary" onClick={startEditing} className="self-start">
        <PencilSimple size={15} /> Edit Personal Information
      </Button>
    </Sheet>
  );
}

export default function ParentAccountPage() {
  const { signOut } = useAuth();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <Link
        href="/parent"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Profile</h1>
        <p className="text-[14px] text-ink-muted">Manage your account and family information.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Personal Information
        </h2>
        <ProfilePhoto />
        <PersonalInformationSection />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Identity Verification
        </h2>
        <VerificationForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Account &amp; Family
        </h2>
        <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-sheet shadow-[var(--shadow-card)]">
          <MenuRow icon={Baby} label="Ward Profiles" href="/parent/children" />
          <MenuRow icon={CalendarCheck} label="My Bookings" href="/parent/bookings" />
          <MenuRow icon={LockKey} label="Safety & Privacy" href="/parent/safety" />
          <MenuRow icon={Question} label="Help & Support" href="/parent/help" />
        </div>
      </section>

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
