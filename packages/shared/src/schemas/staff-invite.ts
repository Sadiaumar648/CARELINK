import { z } from "zod";

// Task 1.8: what an administrator supplies to place a caregiver on the
// roster. Deliberately just enough to create the account and issue an
// invitation — the caregiver fills in bio/rate/skills themselves at 2.1.
//
// email and agencyVerified are both optional, additive fields for
// onboarding an existing agency caregiver (never required, so the
// original invite-a-new-caregiver flow is unaffected):
// - email, when given, becomes the account's real sign-in email instead
//   of the auto-generated placeholder — needed so an existing caregiver
//   can actually recover/reuse this account later via normal sign-in.
// - agencyVerified marks that the agency already verified this person
//   outside CareLink, so they aren't asked to repeat identity
//   verification. It only ever sets the same verification_status
//   column every other verification path already writes to; the caller
//   attests to this explicitly, it is never assumed.
export const createStaffInviteSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name"),
  phone: z.string().trim().min(1, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email").optional(),
  agencyVerified: z.boolean().optional(),
});

export type CreateStaffInviteInput = z.infer<typeof createStaffInviteSchema>;
