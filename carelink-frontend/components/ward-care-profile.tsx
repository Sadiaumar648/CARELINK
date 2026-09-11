// The one real rendering of a child's care profile (age, allergies,
// medications, special needs, routine notes) — shared by the booking
// detail page's "Care profile" Sheet and the parent home's inline
// "View" reveal, so both show exactly the same fields the same way.
export type WardBrief = {
  id?: string;
  display_name: string;
  age_years: number;
  allergies?: string | null;
  medications?: string | null;
  special_needs?: string | null;
  routine_notes?: string | null;
};

export function WardCareProfileList({ wards }: { wards: WardBrief[] }) {
  if (wards.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {wards.map((ward, i) => (
        <div
          key={ward.id ?? i}
          className="flex flex-col gap-1 border-t border-hairline pt-3 first:border-t-0 first:pt-0"
        >
          <p className="text-[15px] font-semibold">
            {ward.display_name} · {ward.age_years}
          </p>
          {ward.allergies && (
            <p className="text-[13px] text-ink-muted">Allergies: {ward.allergies}</p>
          )}
          {ward.medications && (
            <p className="text-[13px] text-ink-muted">Medications: {ward.medications}</p>
          )}
          {ward.special_needs && (
            <p className="text-[13px] text-ink-muted">Special needs: {ward.special_needs}</p>
          )}
          {ward.routine_notes && (
            <p className="text-[13px] text-ink-muted">Routine: {ward.routine_notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}
