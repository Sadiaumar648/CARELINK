"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Baby, LockKey, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { WardCardSkeleton } from "@/components/ui/skeleton";
import { AddWardForm, type Ward } from "@/components/parent/add-ward-form";
import { parseWardGeneralNotes, CARE_STAGE_LABELS } from "@/lib/ward-notes";

type Household = {
  area: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
} | null;

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
          area: area || undefined,
          address: address || undefined,
          emergencyContactName: contactName || undefined,
          emergencyContactPhone: contactPhone || undefined,
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
      <h2 className="text-[19px] font-semibold font-heading">Emergency contact (optional)</h2>
      <p className="text-[13px] text-ink-muted">
        Not required to add a child or request care — each request already has its own care
        location. This is just a contact CareLink can reach if needed.
      </p>
      <Field label="Area (optional)" value={area} onChange={(e) => setArea(e.target.value)} />
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
        {saving ? "Saving…" : "Save emergency contact"}
      </Button>
    </Sheet>
  );
}

export default function ParentChildrenPage() {
  const [household, setHousehold] = useState<Household | undefined>(undefined);
  const [showHouseholdForm, setShowHouseholdForm] = useState(false);
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [addingWard, setAddingWard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Archives rather than deletes (DELETE /api/wards/[id]) — a completed
  // booking keeps the version of this child's profile that was in force
  // when it was made, so removing a child here never rewrites history.
  async function removeWard(id: string) {
    setRemovingId(id);
    setRemoveError(null);
    try {
      await apiFetch(`/api/wards/${id}`, { method: "DELETE" });
      setWards((prev) => (prev ?? []).filter((w) => w.id !== id));
      setConfirmRemoveId(null);
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  function retry() {
    setError(null);
    setHousehold(undefined);
    setWards(null);
    setRetryKey((k) => k + 1);
  }

  // Wards no longer wait on a household row existing — adding a child
  // never required one to begin with; GET /api/wards itself now just
  // returns an empty list for a parent who has neither yet.
  useEffect(() => {
    apiFetch<{ household: Household }>("/api/parents/household")
      .then((res) => setHousehold(res.household))
      .catch((err) => setError(errorMessage(err)));
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch((err) => setError(errorMessage(err)));
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Your Ward Profiles</h1>
        <p className="text-[14px] text-ink-muted">
          Keep your children&apos;s care information organized in one place.
        </p>
      </div>

      <Sheet className="flex items-start gap-3 bg-wisteria-tint">
        <LockKey size={20} className="mt-0.5 shrink-0 text-wisteria-pressed" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold text-wisteria-pressed">
            Your Ward Profile is private
          </p>
          <p className="text-[13px] text-wisteria-pressed">
            Relevant information is shared only with an authorized caregiver when needed for a
            confirmed booking.
          </p>
        </div>
      </Sheet>

      {error && <ErrorState onRetry={retry} />}

      {/* Emergency contact is real, but optional and never blocking —
          a parent can add a child (and request care) without it. Only
          shown as something to fill in once we know there isn't one yet;
          collapsed by default so it never reads as a required step. */}
      {!error && household === null && (
        <>
          {showHouseholdForm ? (
            <HouseholdForm
              onSaved={(h) => {
                setHousehold(h);
                setShowHouseholdForm(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowHouseholdForm(true)}
              className="text-left text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              + Add an emergency contact (optional)
            </button>
          )}
        </>
      )}

      {!error && (
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
              <Sheet key={w.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[18px] font-semibold font-heading text-ink">
                      {w.display_name}
                    </p>
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
                        className="rounded-full bg-wisteria-tint px-2.5 py-1 text-[11.5px] text-wisteria-pressed"
                      >
                        {need}
                      </span>
                    ))}
                  </div>
                )}
                {confirmRemoveId === w.id ? (
                  <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
                    <p className="text-[13px] text-ink-muted">
                      Remove {w.display_name}? This won&apos;t affect any booking already made for
                      them.
                    </p>
                    {removeError && <p className="text-[13px] text-error">{removeError}</p>}
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        onClick={() => setConfirmRemoveId(null)}
                        disabled={removingId === w.id}
                      >
                        Keep
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="default"
                        onClick={() => void removeWard(w.id)}
                        disabled={removingId === w.id}
                      >
                        {removingId === w.id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-5 border-t border-hairline pt-3.5 text-[13px] font-semibold">
                    <Link
                      href={`/parent/children/${w.id}`}
                      className="text-wisteria hover:text-wisteria-hover"
                    >
                      View Profile
                    </Link>
                    <Link
                      href={`/parent/children/${w.id}?edit=1`}
                      className="text-ink-muted hover:text-ink"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveError(null);
                        setConfirmRemoveId(w.id);
                      }}
                      className="text-error hover:text-error/80"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </Sheet>
            );
          })}
          {addingWard ? (
            <AddWardForm
              onAdded={(w) => {
                setWards((prev) => [...(prev ?? []), w]);
                setAddingWard(false);
              }}
              onCancel={() => setAddingWard(false)}
            />
          ) : (
            <Button
              variant="secondary"
              onClick={() => setAddingWard(true)}
              className="w-full justify-center border-dashed py-3"
            >
              <Plus size={16} /> Add Ward Profile
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
