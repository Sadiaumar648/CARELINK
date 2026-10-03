import { Field } from "@/components/ui/field";
import { SelectableChip } from "@/components/onboarding/selectable-card";
import type { SearchFilters, Ward } from "./types";

const AGE_EXPERIENCE_SKILLS: { value: string; label: string }[] = [
  { value: "newborn_care", label: "Newborn Care" },
  { value: "infant_care", label: "Infant Care" },
  { value: "toddler_care", label: "Toddler Care" },
  { value: "school_age_supervision", label: "School-age Supervision" },
];

const OTHER_SKILLS: { value: string; label: string }[] = [
  { value: "meal_preparation", label: "Meal Preparation" },
  { value: "special_needs_care", label: "Special Needs Care" },
  { value: "light_housekeeping", label: "Light Housekeeping" },
];

const RATING_OPTIONS = [4.5, 4.0, 3.5];

export function FilterFields({
  filters,
  onChange,
  wards,
  selectedWardId,
  onSelectWard,
}: {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
  wards: Ward[] | null;
  selectedWardId: string;
  onSelectWard: (wardId: string) => void;
}) {
  function toggleSkill(skill: string) {
    const current = filters.skills ?? [];
    const skills = current.includes(skill)
      ? current.filter((s) => s !== skill)
      : [...current, skill];
    onChange({ skills: skills.length > 0 ? skills : undefined });
  }

  return (
    <div className="flex flex-col gap-6">
      {wards && wards.length > 0 && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="ward-select"
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted"
          >
            Who needs care?
          </label>
          <select
            id="ward-select"
            value={selectedWardId}
            onChange={(e) => onSelectWard(e.target.value)}
            className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
          >
            <option value="">Not specified</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.display_name} — {w.age_years} years
              </option>
            ))}
          </select>
        </div>
      )}

      <Field
        label="Area"
        placeholder="East Legon"
        value={filters.area ?? ""}
        onChange={(e) => onChange({ area: e.target.value || undefined })}
      />

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Availability
        </p>
        <Field
          label="Date"
          type="date"
          value={filters.date ?? ""}
          onChange={(e) => onChange({ date: e.target.value || undefined })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Start time"
            type="time"
            value={filters.startTime ?? ""}
            onChange={(e) => onChange({ startTime: e.target.value || undefined })}
          />
          <Field
            label="End time"
            type="time"
            value={filters.endTime ?? ""}
            onChange={(e) => onChange({ endTime: e.target.value || undefined })}
          />
        </div>
      </div>

      <Field
        label="Minimum years of experience"
        type="number"
        min={0}
        value={filters.minExperience ?? ""}
        onChange={(e) =>
          onChange({ minExperience: e.target.value ? Number(e.target.value) : undefined })
        }
      />

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Rating
        </p>
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map((r) => (
            <SelectableChip
              key={r}
              label={`${r.toFixed(1)}+`}
              selected={filters.minRating === r}
              onClick={() => onChange({ minRating: filters.minRating === r ? undefined : r })}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Age experience
        </p>
        <div className="flex flex-wrap gap-2">
          {AGE_EXPERIENCE_SKILLS.map((s) => (
            <SelectableChip
              key={s.value}
              label={s.label}
              selected={filters.skills?.includes(s.value) ?? false}
              onClick={() => toggleSkill(s.value)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Other skills
        </p>
        <div className="flex flex-wrap gap-2">
          {OTHER_SKILLS.map((s) => (
            <SelectableChip
              key={s.value}
              label={s.label}
              selected={filters.skills?.includes(s.value) ?? false}
              onClick={() => toggleSkill(s.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
