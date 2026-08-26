import { z } from "zod";

// Mirrors the wards table in doc 5 (Backend Schema), §4.3.
// Deliberately minimal: nothing about a child is captured that a caregiver
// does not need to do the job.

export const wardProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name or nickname"),
  ageYears: z.number().int().min(0).max(17),
  allergies: z.string().trim().optional(),
  medications: z.string().trim().optional(),
  mealNotes: z.string().trim().optional(),
  routineNotes: z.string().trim().optional(),
  specialNeeds: z.string().trim().optional(),
  houseRules: z.string().trim().optional(),
  generalNotes: z.string().trim().optional(),
});

export type WardProfileInput = z.infer<typeof wardProfileSchema>;
