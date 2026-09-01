import { z } from "zod";

// Mirrors createStaffInviteSchema exactly, for the same reason: an
// administrator onboarding an existing agency parent supplies just
// enough to create the account and issue an invitation — the parent
// completes their own household profile (parent_profiles, wards) after
// claiming it, via the same self-service flow any new parent already
// uses. See staff-invite.ts for why email and agencyVerified are both
// optional and what each does.
export const createParentInviteSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name"),
  phone: z.string().trim().min(1, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email").optional(),
  agencyVerified: z.boolean().optional(),
  agencyReferenceId: z.string().trim().min(1).optional(),
});

export type CreateParentInviteInput = z.infer<typeof createParentInviteSchema>;
