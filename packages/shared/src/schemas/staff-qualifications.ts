import { z } from "zod";

// Mirrors staff-areas.ts's shape exactly: the caregiver's own PUT
// replaces the whole set, delete-then-insert, same as staff_areas and
// staff_skills already work. verification_status is deliberately not
// settable here — a qualification is created "unverified" and only an
// administrator can change that (self-attestation would defeat the
// point of a verified badge), so this schema simply has no field for it.
export const qualificationInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a qualification or certification name"),
  institution: z.string().trim().min(1).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
});

export const staffQualificationsSchema = z.object({
  qualifications: z.array(qualificationInputSchema).max(20),
});

export type QualificationInput = z.infer<typeof qualificationInputSchema>;
export type StaffQualificationsInput = z.infer<typeof staffQualificationsSchema>;
