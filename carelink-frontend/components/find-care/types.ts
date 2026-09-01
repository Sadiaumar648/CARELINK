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

export function caregiverTypeLabel(type: "nanny" | "babysitter" | null): string | null {
  if (type === "nanny") return "Nanny";
  if (type === "babysitter") return "Babysitter";
  return null;
}

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
