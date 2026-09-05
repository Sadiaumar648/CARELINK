"use client";

import { useEffect, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { hourlyRateFor } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { useAuth } from "@/lib/auth/auth-context";

// CareLink caregiver Settings: the one place a caregiver's
// staff_profiles row is read from. CareLink is an agency-controlled
// platform — a caregiver reaching this dashboard at all already means
// the agency has onboarded, trained, and approved them, so this page
// no longer offers any self-verification, qualifications, skills,
// service-area, or base-location management. What remains editable
// (Emergency Contact) still goes through the exact same
// PATCH /api/staff/profile and staffProfileSchema as before — that
// schema requires the full set of fields together (years/emergency
// contact are non-optional), so an edit here still submits the
// complete current profile, just with its own field(s) changed. No
// backend change, no new endpoint.
export type StaffProfile = {
  bio: string | null;
  caregiver_type: "nanny" | "babysitter" | null;
  years_experience: number;
  hourly_rate: number;
  languages: string[];
  emergency_contact_name: string;
  emergency_contact_phone: string;
  base_address: string | null;
  base_latitude: number | null;
  base_longitude: number | null;
  base_place_id: string | null;
};

async function patchProfile(
  current: StaffProfile,
  patch: Partial<StaffProfile>,
): Promise<StaffProfile> {
  const merged = { ...current, ...patch };
  const res = await apiFetch<{ profile: StaffProfile }>("/api/staff/profile", {
    method: "PATCH",
    body: {
      bio: merged.bio || undefined,
      caregiverType: merged.caregiver_type || undefined,
      yearsExperience: merged.years_experience,
      languages: merged.languages,
      emergencyContactName: merged.emergency_contact_name,
      emergencyContactPhone: merged.emergency_contact_phone,
      baseAddress: merged.base_address ?? undefined,
      baseLatitude: merged.base_latitude ?? undefined,
      baseLongitude: merged.base_longitude ?? undefined,
      basePlaceId: merged.base_place_id ?? undefined,
    },
  });
  return res.profile;
}

function useOwnProfile() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ profile: StaffProfile | null }>("/api/staff/profile")
      .then((res) =>
        setProfile(
          res.profile ?? {
            bio: null,
            caregiver_type: null,
            years_experience: 0,
            hourly_rate: 0,
            languages: [],
            emergency_contact_name: "",
            emergency_contact_phone: "",
            base_address: null,
            base_latitude: null,
            base_longitude: null,
            base_place_id: null,
          },
        ),
      )
      .catch((err) => setError(errorMessage(err)));
  }, []);
  return { profile, setProfile, error };
}

export function PhotoSection() {
  const { user } = useAuth();
  const [photoPath, setPhotoPath] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: { photo_path: string | null } | null }>("/api/staff/profile")
      .then((res) => setPhotoPath(res.profile?.photo_path ?? null))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      const res = await apiFetch<{ photoPath: string }>("/api/staff/photo", {
        method: "POST",
        body: form,
      });
      setPhotoPath(res.photoPath);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  if (photoPath === undefined) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div className="flex items-center gap-4">
      <Avatar
        photoUrl={caregiverPhotoUrl(photoPath)}
        name={(user?.user_metadata?.full_name as string | undefined) ?? "Your photo"}
        size="md"
      />
      <div className="flex flex-col gap-2">
        <label className="w-fit cursor-pointer text-[13px] font-semibold text-wisteria">
          {uploading ? "Uploading…" : photoPath ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => void onSelect(e)}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-[12.5px] text-ink-muted">Parents see this next to your name.</p>
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </div>
  );
}

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

// Professional Information: caregiver type, years of experience,
// languages, and the fixed CareLink rate for that type. Agency-
// controlled, so this is a pure read-only display — no Edit action,
// no form. The agency (not the caregiver) is the source of truth for
// these values; this section only reflects what's already on file.
export function ProfessionalInfoSection() {
  const { profile, error: loadError } = useOwnProfile();

  if (loadError) return <p className="text-[13px] text-error">{loadError}</p>;
  if (!profile) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Caregiver Type
        </span>
        <p className="text-[14.5px] text-ink">
          {profile.caregiver_type ? CAREGIVER_TYPE_LABEL[profile.caregiver_type] : "Not set"}
        </p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Years of Experience
        </span>
        <p className="text-[14.5px] text-ink">{profile.years_experience}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Languages
        </span>
        <p className="text-[14.5px] text-ink">
          {profile.languages.length > 0 ? profile.languages.join(", ") : "Not set"}
        </p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Hourly Rate
        </span>
        <p className="text-[14.5px] font-semibold text-ink">
          {profile.caregiver_type ? `GH₵${hourlyRateFor(profile.caregiver_type)}/hr` : "Not set"}
        </p>
        <p className="text-[11.5px] text-ink-muted">Fixed by CareLink — not caregiver-set.</p>
      </div>
    </Sheet>
  );
}

// Emergency Contact: kept private, shared with a parent only during an
// active booking (see app/staff/safety/page.tsx) — unchanged behavior
// and still the one thing on this page a caregiver manages themselves.
export function EmergencyContactSection() {
  const { profile, setProfile, error: loadError } = useOwnProfile();
  const [editing, setEditing] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (!profile) return;
    setContactName(profile.emergency_contact_name);
    setContactPhone(profile.emergency_contact_phone);
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchProfile(profile, {
        emergency_contact_name: contactName.trim(),
        emergency_contact_phone: contactPhone.trim(),
      });
      setProfile(updated);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-[13px] text-error">{loadError}</p>;
  if (!profile) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (editing) {
    return (
      <Sheet as="form" onSubmit={save} className="flex flex-col gap-4">
        <Field
          label="Contact name"
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <Field
          label="Contact phone"
          type="tel"
          required
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
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
        {profile.emergency_contact_name ? (
          <>
            <p className="text-[15px] font-semibold text-ink">{profile.emergency_contact_name}</p>
            <p className="text-[14px] text-ink-muted">{profile.emergency_contact_phone}</p>
          </>
        ) : (
          <p className="text-[14px] text-ink-muted">Not set yet</p>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        This information is kept private and is only used when necessary for safety purposes.
      </p>
      {saved && <p className="text-[13px] text-wisteria-pressed">Saved.</p>}
      <Button variant="secondary" onClick={startEditing} className="self-start">
        <PencilSimple size={15} /> Edit
      </Button>
    </Sheet>
  );
}
