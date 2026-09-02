"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle, LockKey } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/empty-state";
import { WardCardSkeleton } from "@/components/ui/skeleton";
import { SelectableCard, SelectableChip } from "@/components/onboarding/selectable-card";
import {
  parseWardGeneralNotes,
  serializeWardGeneralNotes,
  CARE_STAGE_LABELS,
} from "@/lib/ward-notes";

type Ward = {
  id: string;
  display_name: string;
  age_years: number;
  allergies: string | null;
  medications: string | null;
  meal_notes: string | null;
  routine_notes: string | null;
  special_needs: string | null;
  house_rules: string | null;
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

function EditForm({ ward, onSaved }: { ward: Ward; onSaved: (w: Ward) => void }) {
  const parsed = parseWardGeneralNotes(ward.general_notes);
  const [ageYears, setAgeYears] = useState(String(ward.age_years));
  const [careStage, setCareStage] = useState<string | null>(parsed.careStage);
  const [careNeeds, setCareNeeds] = useState<string[]>(parsed.careNeeds);
  const [activities, setActivities] = useState<string[]>(parsed.activities);
  const [routineNotes, setRoutineNotes] = useState(ward.routine_notes ?? "");
  const [allergies, setAllergies] = useState(ward.allergies ?? "");
  const [medications, setMedications] = useState(ward.medications ?? "");
  const [specialNeeds, setSpecialNeeds] = useState(ward.special_needs ?? "");
  const [careNotes, setCareNotes] = useState(ward.house_rules ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ ward: Ward }>(`/api/wards/${ward.id}`, {
        method: "PATCH",
        body: {
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
            other: parsed.other,
          }),
        },
      });
      onSaved(res.ward);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-5">
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
        label="Daily routine"
        value={routineNotes}
        onChange={(e) => setRoutineNotes(e.target.value)}
      />
      <Field label="Allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
      <Field
        label="Medications"
        value={medications}
        onChange={(e) => setMedications(e.target.value)}
      />
      <Field
        label="Special needs"
        value={specialNeeds}
        onChange={(e) => setSpecialNeeds(e.target.value)}
      />
      <Field
        label="Additional care notes"
        value={careNotes}
        onChange={(e) => setCareNotes(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving changes…" : "Save Changes"}
      </Button>
    </Sheet>
  );
}

function WardDetail({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const [ward, setWard] = useState<Ward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [justSaved, setJustSaved] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  function retry() {
    setError(null);
    setRetryKey((k) => k + 1);
  }

  useEffect(() => {
    apiFetch<{ ward: Ward }>(`/api/wards/${id}`)
      .then((res) => setWard(res.ward))
      .catch((err) => setError(errorMessage(err)));
  }, [id, retryKey]);

  if (error) return <ErrorState onRetry={retry} />;
  if (!ward) return <WardCardSkeleton />;

  const parsed = parseWardGeneralNotes(ward.general_notes);
  const stageLabel = parsed.careStage
    ? (CARE_STAGE_LABELS[parsed.careStage] ?? parsed.careStage)
    : null;

  if (editing) {
    return (
      <EditForm
        ward={ward}
        onSaved={(w) => {
          setWard(w);
          setEditing(false);
          setJustSaved(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {justSaved && (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-success)]">
          <CheckCircle size={16} weight="fill" /> Profile updated ✓
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold font-heading">{ward.display_name}</h1>
          <p className="text-[14px] text-ink-muted">
            {ward.age_years} years old{stageLabel ? ` · ${stageLabel}` : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setJustSaved(false);
            setEditing(true);
          }}
        >
          Edit Profile
        </Button>
      </div>

      <Sheet className="flex items-start gap-3 bg-wisteria-tint">
        <LockKey size={20} className="mt-0.5 shrink-0 text-wisteria-pressed" />
        <p className="text-[13px] text-wisteria-pressed">
          Your Ward Profile is private. Relevant information is shared with an authorized caregiver
          only when needed for a confirmed booking.
        </p>
      </Sheet>

      <Sheet className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          About
        </h2>
        <p className="text-[14px] text-ink">Age: {ward.age_years}</p>
        <p className="text-[14px] text-ink">Care stage: {stageLabel ?? "Not set"}</p>
      </Sheet>

      <Sheet className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Care Needs
        </h2>
        {parsed.careNeeds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {parsed.careNeeds.map((need) => (
              <span
                key={need}
                className="rounded-full bg-wisteria-tint px-2.5 py-1 text-[12px] text-wisteria-pressed"
              >
                {need}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">No care needs added yet.</p>
        )}
      </Sheet>

      <Sheet className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Daily Routine
        </h2>
        <p className="text-[14px] text-ink">
          {ward.routine_notes || "No routine notes added yet."}
        </p>
      </Sheet>

      <Sheet className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Activities
        </h2>
        {parsed.activities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {parsed.activities.map((activity) => (
              <span
                key={activity}
                className="rounded-full bg-peach-tint px-2.5 py-1 text-[12px] text-ink"
              >
                {activity}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">No activities added yet.</p>
        )}
      </Sheet>

      {(ward.allergies || ward.medications || ward.special_needs) && (
        <Sheet className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Health &amp; Safety
          </h2>
          {ward.allergies && <p className="text-[14px] text-ink">Allergies: {ward.allergies}</p>}
          {ward.medications && (
            <p className="text-[14px] text-ink">Medications: {ward.medications}</p>
          )}
          {ward.special_needs && (
            <p className="text-[14px] text-ink">Special needs: {ward.special_needs}</p>
          )}
        </Sheet>
      )}

      <Sheet className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Care Notes
        </h2>
        <p className="text-[14px] text-ink">
          {ward.house_rules ||
            "No additional care notes — important information the caregiver should know can go here."}
        </p>
      </Sheet>
    </div>
  );
}

export default function WardProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/children"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Ward Profiles
      </Link>
      <Suspense fallback={<WardCardSkeleton />}>
        <WardDetail id={id} />
      </Suspense>
    </div>
  );
}
