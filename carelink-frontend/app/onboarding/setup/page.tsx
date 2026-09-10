"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Stepper } from "@/components/onboarding/stepper";
import { SelectableCard, SelectableChip } from "@/components/onboarding/selectable-card";

const STEPS = ["Location", "Ward profile", "Preferences"];

type Step = 0 | 1 | 2 | 3;

const TRAVEL_OPTIONS = ["Within my area", "Up to 5 km", "Up to 10 km", "I'm flexible"];

const CARE_STAGES = [
  { value: "infant", label: "Infant" },
  { value: "toddler", label: "Toddler" },
  { value: "preschool", label: "Preschool" },
  { value: "school_age", label: "School-age" },
] as const;

const CARE_NEEDS = [
  "Feeding",
  "Homework",
  "Bathing",
  "Play & activities",
  "School pickup",
  "Bedtime routine",
  "Other",
];

const PREFERENCE_OPTIONS = [
  "Experience with my child's age",
  "Location",
  "Availability",
  "Budget",
  "Qualifications",
  "High ratings",
  "Infant experience",
  "Special care experience",
];

function toggle<T>(set: T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

export default function OnboardingSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "there";

  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [area, setArea] = useState("");
  const [travelRadius, setTravelRadius] = useState(TRAVEL_OPTIONS[0]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [wardName, setWardName] = useState("");
  const [wardAge, setWardAge] = useState("");
  const [careStage, setCareStage] = useState<(typeof CARE_STAGES)[number]["value"] | null>(null);
  const [careNeeds, setCareNeeds] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");

  const [priorities, setPriorities] = useState<string[]>([]);
  const [preferenceNotes, setPreferenceNotes] = useState("");

  useEffect(() => {
    apiFetch<{ household: { area: string } | null }>("/api/parents/household")
      .then((res) => {
        if (res.household) setArea(res.household.area);
      })
      .catch(() => undefined);
  }, []);

  async function onLocationContinue() {
    if (!area.trim()) return setError("Enter the area where care will usually take place.");
    if (!contactName.trim() || !contactPhone.trim())
      return setError("We also need someone we can contact in an emergency during care.");
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/parents/household", {
        method: "PATCH",
        body: {
          area,
          emergencyContactName: contactName,
          emergencyContactPhone: contactPhone,
        },
      });
      setStep(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onWardContinue() {
    if (!wardName.trim()) return setError("Enter a name or nickname for your child.");
    if (!wardAge.trim()) return setError("Enter your child's age.");
    setSaving(true);
    setError(null);
    try {
      const notes: string[] = [];
      if (careStage) {
        notes.push(`Care stage: ${CARE_STAGES.find((s) => s.value === careStage)?.label}.`);
      }
      if (careNeeds.length) notes.push(`Care needs: ${careNeeds.join(", ")}.`);
      await apiFetch("/api/wards", {
        method: "POST",
        body: {
          displayName: wardName,
          ageYears: Number(wardAge),
          allergies: allergies || undefined,
          medications: medications || undefined,
          specialNeeds: specialNeeds || undefined,
          generalNotes: notes.length ? notes.join(" ") : undefined,
        },
      });
      setStep(2);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (step === 3) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-balance text-[26px] font-semibold font-heading">
          You&apos;re all set, {firstName}! 🎉
        </h1>
        <p className="max-w-sm text-[15px] text-ink-muted">
          Your CareLink profile is ready. Let&apos;s find care that fits your family.
        </p>
        <Button onClick={() => router.push("/parent")}>Go to My Dashboard →</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Where do you need care?</h1>
            <p className="text-[15px] text-ink-muted">
              Tell us the area where care will usually take place.
            </p>
          </div>
          <Field
            label="Area"
            placeholder="East Legon"
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink">How far are you willing to travel?</p>
            <div className="flex flex-wrap gap-2">
              {TRAVEL_OPTIONS.map((opt) => (
                <SelectableChip
                  key={opt}
                  label={opt}
                  selected={travelRadius === opt}
                  onClick={() => setTravelRadius(opt)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-hairline pt-4">
            <p className="text-[13px] font-semibold text-ink">
              Who should we contact in an emergency during a booking?
            </p>
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
          </div>
          {error && <p className="text-[13px] text-error">{error}</p>}
          <Button onClick={() => void onLocationContinue()} disabled={saving}>
            {saving ? "Saving…" : "Continue →"}
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">
              Tell us about the child you&apos;ll be booking care for.
            </h1>
            <p className="text-[15px] text-ink-muted">
              This helps CareLink recommend caregivers with relevant experience.
            </p>
          </div>
          <Field
            label="Child's first name or nickname"
            required
            value={wardName}
            onChange={(e) => setWardName(e.target.value)}
          />
          <Field
            label="Age"
            type="number"
            min={0}
            max={17}
            required
            value={wardAge}
            onChange={(e) => setWardAge(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink">Care stage</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CARE_STAGES.map((s) => (
                <SelectableCard
                  key={s.value}
                  title={s.label}
                  selected={careStage === s.value}
                  onClick={() => setCareStage(s.value)}
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
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={() => void onWardContinue()} disabled={saving}>
              {saving ? "Saving…" : "Continue →"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">What matters most to you?</h1>
            <p className="text-[15px] text-ink-muted">
              These preferences help us find caregivers who fit your family&apos;s needs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PREFERENCE_OPTIONS.map((opt) => (
              <SelectableChip
                key={opt}
                label={opt}
                selected={priorities.includes(opt)}
                onClick={() => setPriorities((prev) => toggle(prev, opt))}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="preferenceNotes"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
            >
              Anything else we should know?
            </label>
            <textarea
              id="preferenceNotes"
              rows={4}
              placeholder="Tell us anything else about the care you're looking for…"
              value={preferenceNotes}
              onChange={(e) => setPreferenceNotes(e.target.value)}
              className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(3)}>Continue →</Button>
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
