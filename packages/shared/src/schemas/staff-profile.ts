import { z } from "zod";

// Task 2.1: the fields a caregiver sets on their own profile. Mirrors
// staff_profiles in doc 5, §4.4 — hourly_rate is stored in pesewas.
// caregiverType is optional: existing profiles have none yet (the
// column is nullable), and it's meaningful structured data (nanny vs
// babysitter), not something to infer from bio text.
export const caregiverTypeSchema = z.enum(["nanny", "babysitter"]);

export const staffProfileSchema = z.object({
  bio: z.string().trim().max(2000).optional(),
  caregiverType: caregiverTypeSchema.optional(),
  yearsExperience: z.number().int().min(0),
  hourlyRate: z.number().int().positive(),
  languages: z.array(z.string().trim().min(1)).default([]),
  emergencyContactName: z.string().trim().min(1, "Enter an emergency contact name"),
  emergencyContactPhone: z.string().trim().min(1, "Enter an emergency contact phone number"),
});

export type StaffProfileInput = z.infer<typeof staffProfileSchema>;
