import { z } from "zod";

// Task 1.7, household step. Mirrors parent_profiles in doc 5, §4.2.
//
// area/emergencyContact* are no longer required — a parent's location
// can change between requests, and each care_requests row already
// carries its own real, resolved service location independently, so an
// upfront fixed "area" was redundant with that (and the database column
// itself was made nullable to match — migration
// 20260916000000_parent_profiles_household_optional.sql). Adding a
// child never depends on this route at all anymore (POST /api/wards
// creates a bare parent_profiles row on first use). This form still
// exists as an optional way to give CareLink an emergency contact.
export const parentHouseholdSchema = z.object({
  area: z.string().trim().optional(),
  address: z.string().trim().optional(),
  householdNotes: z.string().trim().optional(),
  emergencyContactName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
  emergencyContactRelation: z.string().trim().optional(),
});

export type ParentHouseholdInput = z.infer<typeof parentHouseholdSchema>;
