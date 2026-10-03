// The shape of a GET /api/search/caregivers result row — see
// carelink-backend/supabase/migrations/20260902000000_caregiver_type_qualifications_agency_reference.sql
// for the current public_caregivers view this is drawn from. Every
// field here is real backend data; there is still no distance or
// saved/favourite column anywhere in the schema, so neither appears in
// the UI.
export type CaregiverResult = {
  staff_profile_id: string;
  full_name: string;
  verification_status: string;
  verification_method: "carelink" | "agency" | null;
  photo_path: string | null;
  caregiver_type: "nanny" | "babysitter" | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  languages: string[] | null;
  bio: string | null;
  areas: { area: string; isPrimary: boolean }[];
  qualifications: {
    name: string;
    institution: string | null;
    year: number | null;
    verificationStatus: string;
  }[];
  matchScore: number;
};

// Nanny and Babysitter are merged into one "Nanny" concept for parents
// — every real, non-null `caregiver_type` value (including the
// historical "babysitter" ones still on file) displays as "Nanny"
// everywhere a parent sees it, so nobody has to reason about a
// distinction CareLink no longer asks them to make.
export function caregiverTypeLabel(type: "nanny" | "babysitter" | null): string | null {
  return type ? "Nanny" : null;
}

export type SearchFilters = {
  area?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
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

// Shared by the Find Care ward-picker and the parent Home page's
// Nanny/Babysitter request flow, so both derive a skill suggestion from
// a child's age the same way.
export function suggestedSkillForAge(age: number): string {
  if (age === 0) return "newborn_care";
  if (age <= 2) return "infant_care";
  if (age <= 4) return "toddler_care";
  return "school_age_supervision";
}
