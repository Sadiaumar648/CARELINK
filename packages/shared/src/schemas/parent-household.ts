import { z } from "zod";

// Task 1.7, household step. Mirrors parent_profiles in doc 5, §4.2.
export const parentHouseholdSchema = z.object({
  area: z.string().trim().min(1, "Enter your area"),
  address: z.string().trim().optional(),
  householdNotes: z.string().trim().optional(),
  emergencyContactName: z.string().trim().min(1, "Enter an emergency contact name"),
  emergencyContactPhone: z.string().trim().min(1, "Enter an emergency contact phone number"),
  emergencyContactRelation: z.string().trim().optional(),
});

export type ParentHouseholdInput = z.infer<typeof parentHouseholdSchema>;
