"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash, MapPin } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Stepper } from "@/components/onboarding/stepper";
import { LocationPicker, type ResolvedLocation } from "@/components/location-picker";

// The onboarding step a caregiver reaches after creating their account
// (see claim-invitation/page.tsx and caregiver/join/[token]/page.tsx —
// both continue here). Two things — base location and service area —
// nothing about experience, qualifications, or rate: those stay
// agency-controlled (staff-profile-setup.tsx's ProfessionalInfoSection),
// never something a caregiver declares about themselves here or
// anywhere else. Every caregiver is presented to parents simply as a
// "Nanny" (Nanny/Babysitter merged into one concept), so there's no
// longer a type choice here either — every new profile is created with
// caregiverType "nanny" below; `staff_profiles.caregiver_type` keeps
// the enum internally, it's just never asked about or shown to anyone.
//
// Base location reuses LocationPicker exactly as its own comment
// already anticipates ("reused as-is... see Phase 3") — real, geocoded
// coordinates via the existing /api/geocoding routes, this caregiver's
// base/home point for proximity-based dispatch. Service area is a
// different, existing concept (staff_areas — a named list of places
// they're willing to travel to, up to 3, typed, no coordinates) that
// already had a real column/table/route but no caller anywhere; this
// is its first real UI.

const MAX_SERVICE_AREAS = 3;
const STEPS = ["Base location", "Service area"];

export default function CaregiverOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [serviceAreas, setServiceAreas] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateArea(i: number, value: string) {
    setServiceAreas((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function addArea() {
    setServiceAreas((prev) => (prev.length < MAX_SERVICE_AREAS ? [...prev, ""] : prev));
  }

  function removeArea(i: number) {
    setServiceAreas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function onSubmit() {
    const cleanedAreas = serviceAreas.map((a) => a.trim()).filter(Boolean);
    if (cleanedAreas.length === 0) {
      setError("Add at least one service area.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/staff/profile", {
        method: "PATCH",
        body: {
          caregiverType: "nanny",
          baseAddress: location?.formattedAddress,
          baseLatitude: location?.latitude,
          baseLongitude: location?.longitude,
          basePlaceId: location?.placeId ?? undefined,
        },
      });
      await apiFetch("/api/staff/areas", {
        method: "PUT",
        body: {
          areas: cleanedAreas.map((area, i) => ({ area, isPrimary: i === 0 })),
        },
      });
      router.replace("/staff");
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">Where is your base location?</h1>
            <p className="text-[15px] text-ink-muted">
              This is where you normally start from. CareLink uses it to dispatch you to nearby
              parents based on your proximity.
            </p>
          </div>
          <LocationPicker
            value={location}
            onChange={setLocation}
            description="Allow CareLink to capture your current location, or enter a GPS address."
            helperText="Your exact location is never shown to parents — only used to match you with nearby requests."
            addressPlaceholder="Enter your GPS address"
            confirmedLabel="Base location confirmed"
          />
          {error && <p className="text-[13px] text-error">{error}</p>}
          <Button
            onClick={() => {
              if (!location) return setError("Confirm your base location to continue.");
              setError(null);
              setStep(1);
            }}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold font-heading">
              What areas are you willing to work in?
            </h1>
            <p className="text-[15px] text-ink-muted">
              Add up to 3 areas around your base location where you&apos;re willing to provide care.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {serviceAreas.map((area, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field
                    id={`service-area-${i}`}
                    label={i === 0 ? "Primary area" : `Area ${i + 1}`}
                    placeholder="East Legon"
                    value={area}
                    onChange={(e) => updateArea(i, e.target.value)}
                  />
                </div>
                {serviceAreas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArea(i)}
                    aria-label="Remove area"
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-error-tint hover:text-error"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))}
            {serviceAreas.length < MAX_SERVICE_AREAS && (
              <button
                type="button"
                onClick={addArea}
                className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
              >
                <Plus size={15} /> Add another area
              </button>
            )}
          </div>
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={() => void onSubmit()} disabled={saving}>
              <MapPin size={16} weight="fill" />
              {saving ? "Saving…" : "Finish"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
