"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Baby, LockKey, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { WardCardSkeleton } from "@/components/ui/skeleton";
import { SelectableCard, SelectableChip } from "@/components/onboarding/selectable-card";
import {
  parseWardGeneralNotes,
  serializeWardGeneralNotes,
  CARE_STAGE_LABELS,
} from "@/lib/ward-notes";

type Household = {
  area: string;
  address: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string | null;
} | null;

type Ward = {
  id: string;
  display_name: string;
  age_years: number;
  allergies: string | null;
  medications: string | null;
  special_needs: string | null;
  general_notes: string | null;
};

const CARE_STAGES = Object.entries(CARE_STAGE_LABELS);
const CARE_NEEDS = [
  "Feeding",
  "Homework",
  "Bathing",
  "Play & activities",
  "School pickup",
  "Bedtime routine",
];
const ACTIVITIES = ["Reading", "Drawing", "Outdoor play", "Homework"];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function HouseholdForm({ onSaved }: { onSaved: (h: Household) => void }) {
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ household: Household }>("/api/parents/household", {
        method: "PATCH",
        body: {
          area,
          address: address || undefined,
          emergencyContactName: contactName,
          emergencyContactPhone: contactPhone,
        },
      });
      onSaved(res.household);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Set up your household</h2>
      <p className="text-[13px] text-ink-muted">
        Needed once before you can add a child or request a booking.
      </p>
      <Field label="Area" required value={area} onChange={(e) => setArea(e.target.value)} />
      <Field
        label="Address (optional)"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
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
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save household"}
      </Button>
    </Sheet>
  );
}

function AddWardForm({ onAdded }: { onAdded: (w: Ward) => void }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [careStage, setCareStage] = useState<string | null>(null);
  const [careNeeds, setCareNeeds] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
  const [routineNotes, setRoutineNotes] = useState("");
  const [careNotes, setCareNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ ward: Ward }>("/api/wards", {
        method: "POST",
        body: {
          displayName,
          ageYears: Number(ageYears),
          allergies: allergies || undefined,
          medications: medications || undefined,
          specialNeeds: specialNeeds || undefined,
          routineNotes: routineNotes || undefined,
          houseRules: careNotes || undefined,
          generalNotes: serializeWardGeneralNotes({
            careStage,
            careNeeds,
            activities,
            other: null,
          }),
        },
      });
      onAdded(res.ward);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add Ward Profile
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[19px] font-semibold font-heading">Create a Ward Profile</h2>
        <p className="text-[13px] text-ink-muted">
          Tell us a little about the child so CareLink can help you find suitable care.
        </p>
      </div>
      <Field
        label="Child's first name or nickname"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <Field
        label="Age"
        type="number"
        min={0}
        max={17}
        required
        value={ageYears}
        onChange={(e) => setAgeYears(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink">Care stage</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CARE_STAGES.map(([value, label]) => (
            <SelectableCard
              key={value}
              title={label}
              selected={careStage === value}
              onClick={() => setCareStage(value)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink">Care needs</p>
        <div className="flex flex-wrap gap-2">
          {CARE_NEEDS.map((need) => (
            <SelectableChip
              key={need}
              label={need}
              selected={careNeeds.includes(need)}
              onClick={() => setCareNeeds((prev) => toggle(prev, need))}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink">Activities</p>
        <div className="flex flex-wrap gap-2">
          {ACTIVITIES.map((activity) => (
            <SelectableChip
              key={activity}
              label={activity}
              selected={activities.includes(activity)}
              onClick={() => setActivities((prev) => toggle(prev, activity))}
            />
          ))}
        </div>
      </div>

      <Field
        label="Daily routine (optional)"
        value={routineNotes}
        onChange={(e) => setRoutineNotes(e.target.value)}
      />
      <Field
        label="Allergies (optional)"
        value={allergies}
        onChange={(e) => setAllergies(e.target.value)}
      />
      <Field
        label="Medications (optional)"
        value={medications}
        onChange={(e) => setMedications(e.target.value)}
      />
      <Field
        label="Special needs (optional)"
        value={specialNeeds}
        onChange={(e) => setSpecialNeeds(e.target.value)}
      />
      <Field
        label="Additional care notes (optional)"
        value={careNotes}
        onChange={(e) => setCareNotes(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add child"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

export default function ParentChildrenPage() {
  const [household, setHousehold] = useState<Household | undefined>(undefined);
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function retry() {
    setError(null);
    setHousehold(undefined);
    setWards(null);
    setRetryKey((k) => k + 1);
  }

  useEffect(() => {
    apiFetch<{ household: Household }>("/api/parents/household")
      .then((res) => setHousehold(res.household))
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  useEffect(() => {
    if (!household) return;
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch((err) => setError(errorMessage(err)));
  }, [household]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Your Ward Profiles</h1>
        <p className="text-[14px] text-ink-muted">
          Keep your children&apos;s care information organized in one place.
        </p>
      </div>

      <Sheet className="flex items-start gap-3 bg-sage-tint">
        <LockKey size={20} className="mt-0.5 shrink-0 text-sage-pressed" />
        <p className="text-[13px] text-sage-pressed">
          Your Ward Profile is private. Relevant information is shared with an authorized caregiver
          only when needed for a confirmed booking.
        </p>
      </Sheet>

      {error && <ErrorState onRetry={retry} />}

      {!error && household === undefined && (
        <div className="flex flex-col gap-3">
          <WardCardSkeleton />
          <WardCardSkeleton />
        </div>
      )}

      {!error && household === null && <HouseholdForm onSaved={setHousehold} />}

      {!error && household && (
        <div className="flex flex-col gap-4">
          {wards === null && (
            <div className="flex flex-col gap-3">
              <WardCardSkeleton />
            </div>
          )}

          {wards && wards.length === 0 && (
            <EmptyState
              icon={Baby}
              title="No ward profiles yet"
              description="Add a child so CareLink can recommend caregivers with relevant experience."
            />
          )}

          {wards?.map((w) => {
            const parsed = parseWardGeneralNotes(w.general_notes);
            const stageLabel = parsed.careStage
              ? (CARE_STAGE_LABELS[parsed.careStage] ?? parsed.careStage)
              : null;
            return (
              <Sheet key={w.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-semibold font-heading">{w.display_name}</p>
                    <p className="text-[13px] text-ink-muted">
                      {w.age_years} years old{stageLabel ? ` · ${stageLabel}` : ""}
                    </p>
                  </div>
                </div>
                {parsed.careNeeds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.careNeeds.map((need) => (
                      <span
                        key={need}
                        className="rounded-full bg-sage-tint px-2.5 py-1 text-[11.5px] text-sage-pressed"
                      >
                        {need}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-4 border-t border-hairline pt-3 text-[13px] font-semibold">
                  <Link
                    href={`/parent/children/${w.id}`}
                    className="text-sage hover:text-sage-hover"
                  >
                    View Profile
                  </Link>
                  <Link
                    href={`/parent/children/${w.id}?edit=1`}
                    className="text-ink-muted hover:text-ink"
                  >
                    Edit
                  </Link>
                </div>
              </Sheet>
            );
          })}
          <AddWardForm onAdded={(w) => setWards((prev) => [...(prev ?? []), w])} />
        </div>
      )}
    </div>
  );
}
