import { z } from "zod";

// Task 4.12. Weights must still sum to 1 — an invalid set is refused.
export const updateWeightsSchema = z.object({
  availability: z.number().min(0).max(1),
  area: z.number().min(0).max(1),
  skills: z.number().min(0).max(1),
  ratingExperience: z.number().min(0).max(1),
  budget: z.number().min(0).max(1),
});
export type UpdateWeightsInput = z.infer<typeof updateWeightsSchema>;

export const updatePlatformSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type UpdatePlatformSettingInput = z.infer<typeof updatePlatformSettingSchema>;
