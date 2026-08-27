"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

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
};

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
      <h2 className="text-[19px] font-semibold">Set up your household</h2>
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
      {error && <p className="text-[13px] text-magenta">{error}</p>}
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
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
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
        },
      });
      onAdded(res.ward);
      setDisplayName("");
      setAgeYears("");
      setAllergies("");
      setMedications("");
      setSpecialNeeds("");
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
        Add a child
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Name or nickname"
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
      {error && <p className="text-[13px] text-magenta">{error}</p>}
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

  useEffect(() => {
    apiFetch<{ household: Household }>("/api/parents/household")
      .then((res) => setHousehold(res.household))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!household) return;
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch((err) => setError(errorMessage(err)));
  }, [household]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Children</h1>
      {error && <p className="text-[13px] text-magenta">{error}</p>}

      {household === undefined && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {household === null && <HouseholdForm onSaved={setHousehold} />}

      {household && (
        <div className="flex flex-col gap-4">
          {wards?.map((w) => (
            <Sheet key={w.id} className="flex flex-col gap-1">
              <p className="text-[17px] font-semibold">
                {w.display_name} · {w.age_years}
              </p>
              {w.allergies && (
                <p className="text-[13px] text-ink-muted">Allergies: {w.allergies}</p>
              )}
              {w.medications && (
                <p className="text-[13px] text-ink-muted">Medications: {w.medications}</p>
              )}
              {w.special_needs && (
                <p className="text-[13px] text-ink-muted">Special needs: {w.special_needs}</p>
              )}
            </Sheet>
          ))}
          <AddWardForm onAdded={(w) => setWards((prev) => [...(prev ?? []), w])} />
        </div>
      )}
    </div>
  );
}
