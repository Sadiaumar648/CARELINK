import { z } from "zod";

// The self-registration counterpart to claim-invitation.ts: a caregiver
// who received a shared onboarding link (admin's "Generate Caregiver
// Onboarding Link", api/admin/onboarding-links) rather than a private
// code+phone pair (api/admin/staff) supplies their own name, phone, and
// password directly against the link's token — there's no pre-created
// placeholder account to claim, since the link was never issued to one
// specific person.
//
// Mirrors the parent registration form's identity fields (Ghana Card
// number + live photo, app/register/page.tsx) rather than the older
// document-upload wizard's fuller set (ID type choice, physical ID
// card photo, reference contact) — this route is always a Ghana Card
// number, submitted as a lightweight verification_submissions row for
// an admin to review, same queue as everything else at
// /admin/verifications. The live photo itself travels as multipart
// form data, not through this schema (see the route).
export const joinOnboardingLinkSchema = z.object({
  token: z.string().trim().min(1, "Missing invitation link"),
  fullName: z.string().trim().min(1, "Enter your full name"),
  phone: z.string().trim().min(1, "Enter your phone number"),
  idDocumentNumber: z.string().trim().min(1, "Enter your Ghana Card ID number"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type JoinOnboardingLinkInput = z.infer<typeof joinOnboardingLinkSchema>;
