import { z } from "zod";

// The self-registration counterpart to claim-invitation.ts: a caregiver
// who received a shared onboarding link (admin's "Generate Caregiver
// Onboarding Link", api/admin/onboarding-links) rather than a private
// code+phone pair (api/admin/staff) supplies their own name, phone, and
// password directly against the link's token — there's no pre-created
// placeholder account to claim, since the link was never issued to one
// specific person.
//
// No identity document or photo is collected here: only staff the
// agency has already trained and approved ever receive this link in
// the first place, so the link itself is the verification — the
// account is marked agency-verified the moment it's created (see the
// route).
export const joinOnboardingLinkSchema = z.object({
  token: z.string().trim().min(1, "Missing invitation link"),
  fullName: z.string().trim().min(1, "Enter your full name"),
  phone: z.string().trim().min(1, "Enter your phone number"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type JoinOnboardingLinkInput = z.infer<typeof joinOnboardingLinkSchema>;
