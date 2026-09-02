"use client";

import { useEffect, useState } from "react";
import { skillTagSchema, type SkillTag, type DayPart } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { useAuth } from "@/lib/auth/auth-context";

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Saved({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-[13px] text-wisteria-pressed">Saved.</p>;
}

function PhotoSection() {
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
    <Sheet className="flex items-center gap-4">
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
        <p className="text-[13px] text-ink-muted">Parents see this next to your name in search.</p>
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Sheet>
  );
}

type Profile = {
  bio: string | null;
  caregiver_type: "nanny" | "babysitter" | null;
  years_experience: number;
  hourly_rate: number;
  languages: string[];
  emergency_contact_name: string;
  emergency_contact_phone: string;
} | null;

const CAREGIVER_TYPES: { value: "nanny" | "babysitter"; label: string }[] = [
  { value: "nanny", label: "Nanny" },
  { value: "babysitter", label: "Babysitter" },
];

function ProfileSection() {
  const [bio, setBio] = useState("");
  const [caregiverType, setCaregiverType] = useState<"nanny" | "babysitter" | "">("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [languages, setLanguages] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: Profile }>("/api/staff/profile")
      .then((res) => {
        if (res.profile) {
          setBio(res.profile.bio ?? "");
          setCaregiverType(res.profile.caregiver_type ?? "");
          setYearsExperience(String(res.profile.years_experience));
          setHourlyRate(String(res.profile.hourly_rate));
          setLanguages(res.profile.languages.join(", "));
          setContactName(res.profile.emergency_contact_name);
          setContactPhone(res.profile.emergency_contact_phone);
        }
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/staff/profile", {
        method: "PATCH",
        body: {
          bio: bio || undefined,
          caregiverType: caregiverType || undefined,
          yearsExperience: Number(yearsExperience),
          hourlyRate: Number(hourlyRate),
          languages: languages
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean),
          emergencyContactName: contactName,
          emergencyContactPhone: contactPhone,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Profile</h2>
      <div className="flex flex-col gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Caregiver type (optional)
        </span>
        <div className="flex gap-2">
          {CAREGIVER_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCaregiverType((c) => (c === t.value ? "" : t.value))}
              className={`rounded border px-3 py-2 text-[13px] font-semibold ${
                caregiverType === t.value
                  ? "border-wisteria bg-wisteria/10 text-wisteria-pressed"
                  : "border-hairline text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Years of experience"
          type="number"
          min={0}
          required
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
        />
        <Field
          label="Hourly rate (GH₵)"
          type="number"
          min={1}
          required
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
      </div>
      <Field
        label="Languages (comma-separated)"
        value={languages}
        onChange={(e) => setLanguages(e.target.value)}
      />
      <Field
        label="Emergency contact name"
        required
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
      />
      <Field
        label="Emergency contact phone"
        type="tel"
        required
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Saved show={saved} />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </Sheet>
  );
}

function SkillsSection() {
  const [skills, setSkills] = useState<SkillTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ skills: SkillTag[] }>("/api/staff/skills")
      .then((res) => {
        setSkills(res.skills);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function toggle(skill: SkillTag) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/staff/skills", { method: "PUT", body: { skills } });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {skillTagSchema.options.map((skill) => {
          const active = skills.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              className={`min-h-[52px] rounded border px-3 py-2 text-[13px] font-semibold ${
                active
                  ? "border-wisteria bg-wisteria/10 text-wisteria-pressed"
                  : "border-hairline text-ink-muted"
              }`}
            >
              {skillLabel(skill)}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Saved show={saved} />
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save skills"}
      </Button>
    </Sheet>
  );
}

type AreaEntry = { area: string; isPrimary: boolean };

function AreasSection() {
  const [areas, setAreas] = useState<AreaEntry[]>([]);
  const [newArea, setNewArea] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ areas: AreaEntry[] }>("/api/staff/areas")
      .then((res) => {
        setAreas(res.areas);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function addArea() {
    if (!newArea.trim()) return;
    setAreas((prev) => [...prev, { area: newArea.trim(), isPrimary: prev.length === 0 }]);
    setNewArea("");
  }

  function removeArea(area: string) {
    setAreas((prev) => prev.filter((a) => a.area !== area));
  }

  function setPrimary(area: string) {
    setAreas((prev) => prev.map((a) => ({ ...a, isPrimary: a.area === area })));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/staff/areas", { method: "PUT", body: { areas } });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Service areas</h2>
      <div className="flex flex-col gap-2">
        {areas.map((a) => (
          <div key={a.area} className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPrimary(a.area)}
              className={`flex-1 rounded border px-3 py-2 text-left text-[15px] ${
                a.isPrimary
                  ? "border-wisteria bg-wisteria/10 text-wisteria-pressed"
                  : "border-hairline"
              }`}
            >
              {a.area} {a.isPrimary && "(primary)"}
            </button>
            <button
              type="button"
              onClick={() => removeArea(a.area)}
              className="text-[13px] text-error"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <input
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
          placeholder="Add an area"
          className="flex-1 rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        />
        <Button type="button" variant="secondary" onClick={addArea}>
          Add
        </Button>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Saved show={saved} />
      <Button onClick={() => void save()} disabled={saving || areas.length === 0}>
        {saving ? "Saving…" : "Save areas"}
      </Button>
    </Sheet>
  );
}

const PARTS: { part: DayPart; label: string; startTime: string; endTime: string }[] = [
  { part: "morning", label: "Morning", startTime: "06:00", endTime: "12:00" },
  { part: "afternoon", label: "Afternoon", startTime: "12:00", endTime: "17:00" },
  { part: "evening", label: "Evening", startTime: "17:00", endTime: "21:00" },
  { part: "overnight", label: "Overnight", startTime: "21:00", endTime: "23:45" },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Window = { weekday: number; part: DayPart; startTime: string; endTime: string };

function AvailabilitySection() {
  const [windows, setWindows] = useState<Window[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ windows: Window[] }>("/api/staff/availability")
      .then((res) => {
        setWindows(res.windows);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function isOn(weekday: number, part: DayPart) {
    return windows.some((w) => w.weekday === weekday && w.part === part);
  }

  function toggle(weekday: number, part: DayPart) {
    setWindows((prev) => {
      if (prev.some((w) => w.weekday === weekday && w.part === part)) {
        return prev.filter((w) => !(w.weekday === weekday && w.part === part));
      }
      const def = PARTS.find((p) => p.part === part)!;
      return [...prev, { weekday, part, startTime: def.startTime, endTime: def.endTime }];
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/staff/availability", {
        method: "PUT",
        body: { windows, exceptions: [] },
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Availability</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left text-ink-muted"></th>
              {WEEKDAYS.map((d) => (
                <th key={d} className="px-2 py-1 text-center font-semibold text-ink-muted">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PARTS.map((p) => (
              <tr key={p.part}>
                <td className="pr-2 text-ink-muted">{p.label}</td>
                {WEEKDAYS.map((_, weekday) => {
                  const on = isOn(weekday, p.part);
                  return (
                    <td key={weekday} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(weekday, p.part)}
                        aria-label={`${p.label} ${WEEKDAYS[weekday]}`}
                        className={`h-[52px] w-[52px] rounded border ${
                          on ? "border-wisteria bg-wisteria/20" : "border-hairline"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Saved show={saved} />
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save availability"}
      </Button>
    </Sheet>
  );
}

type Qualification = { id?: string; name: string; institution: string; year: string };

// Mirrors AreasSection's own add/remove-then-save-the-whole-list
// pattern exactly, against the new GET/PUT /api/staff/qualifications
// (same delete-then-insert shape staff_areas and staff_skills already
// use). verificationStatus isn't editable here — an administrator sets
// that, this section only manages what the caregiver themselves claims.
function QualificationsSection() {
  const [items, setItems] = useState<Qualification[]>([]);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{
      qualifications: {
        id: string;
        name: string;
        institution: string | null;
        year: number | null;
      }[];
    }>("/api/staff/qualifications")
      .then((res) => {
        setItems(
          res.qualifications.map((q) => ({
            id: q.id,
            name: q.name,
            institution: q.institution ?? "",
            year: q.year ? String(q.year) : "",
          })),
        );
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function addItem() {
    if (!name.trim()) return;
    setItems((prev) => [
      ...prev,
      { name: name.trim(), institution: institution.trim(), year: year.trim() },
    ]);
    setName("");
    setInstitution("");
    setYear("");
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/staff/qualifications", {
        method: "PUT",
        body: {
          qualifications: items.map((q) => ({
            name: q.name,
            institution: q.institution || undefined,
            year: q.year ? Number(q.year) : undefined,
          })),
        },
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Qualifications & certifications</h2>
      <p className="text-[13px] text-ink-muted">
        Optional — an administrator reviews these before they show as verified on your profile.
      </p>
      <div className="flex flex-col gap-2">
        {items.map((q, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded border border-hairline px-3 py-2"
          >
            <span className="text-[14px] text-ink">
              {q.name}
              {q.institution ? ` — ${q.institution}` : ""}
              {q.year ? ` (${q.year})` : ""}
            </span>
            <button type="button" onClick={() => removeItem(i)} className="text-[13px] text-error">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. First Aid Certificate)"
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        />
        <input
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="Institution (optional)"
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        />
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Year (optional)"
          type="number"
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        />
      </div>
      <Button type="button" variant="secondary" onClick={addItem} className="self-start">
        Add
      </Button>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Saved show={saved} />
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save qualifications"}
      </Button>
    </Sheet>
  );
}

export function StaffProfileSetup() {
  return (
    <div className="flex flex-col gap-6">
      <PhotoSection />
      <ProfileSection />
      <SkillsSection />
      <QualificationsSection />
      <AreasSection />
      <AvailabilitySection />
    </div>
  );
}
