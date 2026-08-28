"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

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

  if (!weights) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold">Match-scoring weights</h2>
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

  if (rate === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold">Commission rate</h2>
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
      <h1 className="text-[26px] font-semibold">Settings</h1>
      <WeightsSection />
      <CommissionSection />
    </div>
  );
}
