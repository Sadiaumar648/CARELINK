"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SelectableCard, SelectableChip } from "@/components/onboarding/selectable-card";
import { serializeWardGeneralNotes, CARE_STAGE_LABELS } from "@/lib/ward-notes";

export type Ward = {
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

// The one real "add a child" form and the one real POST /api/wards call
// site — used both from Settings → Ward Profiles (children/page.tsx) and
// inline from the Request a Nanny/Babysitter flow (request-flow-panel.tsx)
// so a parent adding a child mid-request never navigates away and never
// loses what they'd already filled in on the request form. The caller
// owns visibility (whether the form is showing at all) and what happens
// next — this component only ever creates the ward and reports it back.
export function AddWardForm({
  onAdded,
  onCancel,
}: {
  onAdded: (w: Ward) => void;
  onCancel: () => void;
}) {
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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
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
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
