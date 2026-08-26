import { z } from "zod";

// Task 2.1: the fields a caregiver sets on their own profile. Mirrors
// staff_profiles in doc 5, §4.4 — hourly_rate is stored in pesewas.
export const staffProfileSchema = z.object({
  bio: z.string().trim().max(2000).optional(),
  yearsExperience: z.number().int().min(0),
  hourlyRate: z.number().int().positive(),
  languages: z.array(z.string().trim().min(1)).default([]),
  emergencyContactName: z.string().trim().min(1, "Enter an emergency contact name"),
  emergencyContactPhone: z.string().trim().min(1, "Enter an emergency contact phone number"),
});

export type StaffProfileInput = z.infer<typeof staffProfileSchema>;
