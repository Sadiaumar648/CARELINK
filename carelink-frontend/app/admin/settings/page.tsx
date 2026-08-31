"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type Weight = { factor: string; weight: number };

const FACTOR_LABELS: Record<string, string> = {
  availability: "Availability",
  area: "Area",
  skills: "Skills",
  rating_experience: "Rating & experience",
  budget: "Budget",
};

function WeightsSection() {
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ weights: Weight[] }>("/api/admin/settings/weights")
      .then((res) => setWeights(Object.fromEntries(res.weights.map((w) => [w.factor, w.weight]))))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const sum = weights ? Object.values(weights).reduce((a, b) => a + b, 0) : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!weights) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/admin/settings/weights", {
        method: "PATCH",
        body: {
          availability: weights.availability,
          area: weights.area,
          skills: weights.skills,
          ratingExperience: weights.rating_experience,
          budget: weights.budget,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!weights) return <Skeleton className="h-64" />;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Match-scoring weights</h2>
      <p className="text-[13px] text-ink-muted">Must sum to 1. Currently {sum.toFixed(2)}.</p>
      {Object.entries(weights).map(([factor, value]) => (
        <Field
          key={factor}
          label={FACTOR_LABELS[factor] ?? factor}
          type="number"
          step="0.01"
          min={0}
          max={1}
          value={value}
          onChange={(e) => setWeights((w) => (w ? { ...w, [factor]: Number(e.target.value) } : w))}
        />
      ))}
      {error && <p className="text-[13px] text-error">{error}</p>}
      {saved && <p className="text-[13px] text-sage-pressed">Saved.</p>}
      <Button type="submit" disabled={saving || Math.abs(sum - 1) > 0.005}>
        {saving ? "Saving…" : "Save weights"}
      </Button>
    </Sheet>
  );
}

const EMERGENCY_NUMBER_KEYS = [
  { key: "police_emergency_number", label: "Police / Security emergency number" },
  { key: "fire_emergency_number", label: "Fire & Rescue emergency number" },
  { key: "medical_emergency_number", label: "Medical emergency number" },
] as const;

// Backs the caregiver-facing SOS screen's police/fire/medical options
// (GET /api/settings/emergency-contacts) — that screen never guesses a
// number, so it stays blank ("not yet configured") until set here.
function EmergencyContactsSection() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all(
      EMERGENCY_NUMBER_KEYS.map(({ key }) =>
        apiFetch<{ setting: { value: string } }>(`/api/admin/settings/${key}`)
          .then((res) => [key, String(res.setting.value)] as const)
          .catch(() => [key, ""] as const),
      ),
    ).then((entries) => setValues(Object.fromEntries(entries)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await Promise.all(
        EMERGENCY_NUMBER_KEYS.map(({ key }) =>
          apiFetch(`/api/admin/settings/${key}`, {
            method: "PATCH",
            body: { value: values[key] ?? "" },
          }),
        ),
      );
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!values) return <Skeleton className="h-64" />;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Emergency contact numbers</h2>
      <p className="text-[13px] text-ink-muted">
        Shown to caregivers on the Emergency SOS screen. Left blank, that option shows &quot;not yet
        configured&quot; rather than a guessed number.
      </p>
      {EMERGENCY_NUMBER_KEYS.map(({ key, label }) => (
        <Field
          key={key}
          label={label}
          type="tel"
          placeholder="e.g. 191"
          value={values[key] ?? ""}
          onChange={(e) => setValues((v) => (v ? { ...v, [key]: e.target.value } : v))}
        />
      ))}
      {error && <p className="text-[13px] text-error">{error}</p>}
      {saved && <p className="text-[13px] text-sage-pressed">Saved.</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save emergency numbers"}
      </Button>
    </Sheet>
  );
}

function CommissionSection() {
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ setting: { value: number } }>("/api/admin/settings/commission_rate")
      .then((res) => setRate(Number(res.setting.value)))
      .catch(() => setRate(0.15));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rate === null) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/admin/settings/commission_rate", {
        method: "PATCH",
        body: { value: rate },
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (rate === null) return <Skeleton className="h-40" />;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Commission rate</h2>
      <p className="text-[13px] text-ink-muted">
        Applies to bookings completed after this changes — already-settled payments are untouched.
      </p>
      <Field
        label="Rate (0–1)"
        type="number"
        step="0.01"
        min={0}
        max={1}
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      {saved && <p className="text-[13px] text-sage-pressed">Saved.</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save rate"}
      </Button>
    </Sheet>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold font-heading">Settings</h1>
      <WeightsSection />
      <CommissionSection />
      <EmergencyContactsSection />
    </div>
  );
}
