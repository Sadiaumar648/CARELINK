import { z } from "zod";

// Task 2.1: the fields a caregiver sets on their own profile. Mirrors
// staff_profiles in doc 5, §4.4 — hourly_rate is stored in pesewas.
// caregiverType is optional: existing profiles have none yet (the
// column is nullable), and it's meaningful structured data (nanny vs
// babysitter), not something to infer from bio text.
export const caregiverTypeSchema = z.enum(["nanny", "babysitter"]);

export const staffProfileSchema = z
  .object({
    bio: z.string().trim().max(2000).optional(),
    caregiverType: caregiverTypeSchema.optional(),
    yearsExperience: z.number().int().min(0),
    hourlyRate: z.number().int().positive(),
    languages: z.array(z.string().trim().min(1)).default([]),
    emergencyContactName: z.string().trim().min(1, "Enter an emergency contact name"),
    emergencyContactPhone: z.string().trim().min(1, "Enter an emergency contact phone number"),
    // Optional for now (an existing profile can be saved without one) —
    // the caregiver's map-resolved base/service location, distinct from
    // staff_areas' named-area list. If any of the three is sent, all
    // three must be, so a base location is never stored half-resolved.
    baseAddress: z.string().trim().min(1).max(300).optional(),
    baseLatitude: z.number().min(-90).max(90).optional(),
    baseLongitude: z.number().min(-180).max(180).optional(),
    basePlaceId: z.string().trim().max(200).optional(),
  })
  .refine(
    (r) =>
      (r.baseAddress == null && r.baseLatitude == null && r.baseLongitude == null) ||
      (r.baseAddress != null && r.baseLatitude != null && r.baseLongitude != null),
    {
      message: "Choose your base location again — it didn't fully resolve",
      path: ["baseAddress"],
    },
  );

export type StaffProfileInput = z.infer<typeof staffProfileSchema>;
