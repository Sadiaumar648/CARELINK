// The shape of a GET /api/search/caregivers result row — see
// carelink-backend/supabase/migrations/20260827170000_verification_gates.sql
// for the public_caregivers view this is drawn from. Every field here is
// real backend data; there is no "caregiver type" (nanny/babysitter),
// distance, availability-summary text, or saved/favourite column on that
// view or anywhere else in the schema, so none of those appear in the UI.
export type CaregiverResult = {
  staff_profile_id: string;
  full_name: string;
  verification_status: string;
  photo_path: string | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  areas: { area: string; isPrimary: boolean }[];
  matchScore: number;
};

export type SearchFilters = {
  area?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  budgetCeiling?: number;
  minExperience?: number;
  minRating?: number;
  skills?: string[];
};

export type Ward = { id: string; display_name: string; age_years: number };

export function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function activeFilterCount(filters: SearchFilters): number {
  return Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0),
  ).length;
}
