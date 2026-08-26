import { z } from "zod";

// Task 1.8: what an administrator supplies to place a caregiver on the
// roster. Deliberately just enough to create the account and issue an
// invitation — the caregiver fills in bio/rate/skills themselves at 2.1.
export const createStaffInviteSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name"),
  phone: z.string().trim().min(1, "Enter a phone number"),
});

export type CreateStaffInviteInput = z.infer<typeof createStaffInviteSchema>;
