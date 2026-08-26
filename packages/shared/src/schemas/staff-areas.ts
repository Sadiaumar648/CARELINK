import { z } from "zod";

// Task 2.2: one primary area plus optional additional areas. Primary
// area scores full in matching (task 2.7); additional areas score
// reduced (doc 5, §4.5).
export const staffAreaSchema = z.object({
  area: z.string().trim().min(1),
  isPrimary: z.boolean().default(false),
});

export const staffAreasSchema = z.object({
  areas: z.array(staffAreaSchema).min(1, "Add at least one service area"),
});

export type StaffAreasInput = z.infer<typeof staffAreasSchema>;
