"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CaretRight,
  LockKey,
  PencilSimple,
  Question,
  SignOut,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { getSupabaseClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import {
  PhotoSection,
  ProfessionalInfoSection,
  EmergencyContactSection,
} from "@/components/staff-profile-setup";

function MenuRow({
  icon: IconComponent,
  label,
  href,
}: {
  icon: typeof LockKey;
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

// Same real mechanism as app/parent/account/page.tsx's own Personal
// Information section: full_name/phone live in Supabase Auth's
// user_metadata, saved via supabase.auth.updateUser() directly — no new
// backend route. Email stays read-only for the same reason it does for
// Parent: changing an auth email is a security-sensitive flow (confirm
// both addresses) that doesn't exist anywhere in this app yet.
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

  return (
    <div className="flex flex-col gap-4">
      <PhotoSection />

      {editing ? (
        <Sheet as="form" onSubmit={save} className="flex flex-col gap-4">
          <Field
            label="Full name"
            required
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <Field
            label="Phone"
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
      ) : (
        <Sheet className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {fullName && <p className="text-[15px] font-semibold text-ink">{fullName}</p>}
            <p className="text-[14px] text-ink">{user?.email}</p>
            {phone && <p className="text-[14px] text-ink-muted">{phone}</p>}
          </div>
          {saved && <p className="text-[13px] text-wisteria-pressed">Saved.</p>}
          <Button variant="secondary" onClick={startEditing} className="self-start">
            <PencilSimple size={15} /> Edit
          </Button>
        </Sheet>
      )}
    </div>
  );
}

export default function StaffSettingsPage() {
  const { signOut } = useAuth();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 md:p-8">
      <Link
        href="/staff"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">Settings</h1>
        <p className="text-[14px] text-ink-muted">
          Manage your personal information and CareLink account.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Personal Information
        </h2>
        <PersonalInformationSection />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Professional Information
        </h2>
        <ProfessionalInfoSection />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Emergency Contact
        </h2>
        <EmergencyContactSection />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Account &amp; Support
        </h2>
        <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-sheet shadow-[var(--shadow-card)]">
          <MenuRow icon={LockKey} label="Safety & Privacy" href="/staff/safety" />
          <MenuRow icon={Question} label="Help & Support" href="/staff/help" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center justify-between gap-3 px-5 py-4 text-left text-error hover:bg-error-tint"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium">
              <SignOut size={20} />
              Sign Out
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
