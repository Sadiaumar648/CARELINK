import { z } from "zod";

// Task 1.9: what a caregiver supplies to claim the roster record an
// administrator already created for them, per doc 3 (App Flow) §2.3 step 1
// — invitation code, phone, and a password they choose themselves.
export const claimInvitationSchema = z.object({
  code: z.string().trim().min(1, "Enter the invitation code"),
  phone: z.string().trim().min(1, "Enter your phone number"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type ClaimInvitationInput = z.infer<typeof claimInvitationSchema>;
