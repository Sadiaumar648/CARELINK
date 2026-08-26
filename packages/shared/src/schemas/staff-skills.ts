import { z } from "zod";
import { skillTagSchema } from "../enums";

// Task 2.2: tags come from the fixed vocabulary only (doc 1, PRD, F2) —
// free text is never accepted, which is what makes the skill-match factor
// in task 2.7 computable at all.
export const staffSkillsSchema = z.object({
  skills: z.array(skillTagSchema).max(7),
});

export type StaffSkillsInput = z.infer<typeof staffSkillsSchema>;
