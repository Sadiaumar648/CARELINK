import { parseWardGeneralNotes, CARE_STAGE_LABELS } from "@/lib/ward-notes";

// The one real rendering of a child's care profile — every field a
// parent can actually enter on their Ward Profile page
// (app/parent/children/[id]/page.tsx), shown the same way here: care
// stage, care needs, activities (all parsed out of general_notes, the
// one free-text column those are packed into — see lib/ward-notes.ts),
// daily routine, allergies, medications, special needs, meal notes, and
// care notes (house_rules). Shared by the booking detail page's "Care
// profile" Sheet and the parent/caregiver home pages' inline "View"
// reveal, so all three show exactly the same information the same way
// — nothing a parent entered is ever silently missing from what a
// caregiver can see.
export type WardBrief = {
  id?: string;
  display_name: string;
  age_years: number;
  allergies?: string | null;
  medications?: string | null;
  meal_notes?: string | null;
  routine_notes?: string | null;
  special_needs?: string | null;
  house_rules?: string | null;
  general_notes?: string | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[13px] text-ink-muted">
      <span className="font-medium text-ink">{label}:</span> {value}
    </p>
  );
}

function OneWardCareProfile({ ward }: { ward: WardBrief }) {
  const parsed = parseWardGeneralNotes(ward.general_notes);
  const stageLabel = parsed.careStage
    ? (CARE_STAGE_LABELS[parsed.careStage] ?? parsed.careStage)
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[15px] font-semibold">
        {ward.display_name} · {ward.age_years}
        {stageLabel ? ` · ${stageLabel}` : ""}
      </p>
      {parsed.careNeeds.length > 0 && (
        <Field label="Care needs" value={parsed.careNeeds.join(", ")} />
      )}
      {parsed.activities.length > 0 && (
        <Field label="Activities" value={parsed.activities.join(", ")} />
      )}
      {parsed.other && <Field label="Notes" value={parsed.other} />}
      {ward.routine_notes && <Field label="Daily routine" value={ward.routine_notes} />}
      {ward.allergies && <Field label="Allergies" value={ward.allergies} />}
      {ward.medications && <Field label="Medications" value={ward.medications} />}
      {ward.special_needs && <Field label="Special needs" value={ward.special_needs} />}
      {ward.meal_notes && <Field label="Meal notes" value={ward.meal_notes} />}
      {ward.house_rules && <Field label="Care notes" value={ward.house_rules} />}
    </div>
  );
}

export function WardCareProfileList({ wards }: { wards: WardBrief[] }) {
  if (wards.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {wards.map((ward, i) => (
        <div
          key={ward.id ?? i}
          className="flex flex-col gap-1 border-t border-hairline pt-3 first:border-t-0 first:pt-0"
        >
          <OneWardCareProfile ward={ward} />
        </div>
      ))}
    </div>
  );
}
