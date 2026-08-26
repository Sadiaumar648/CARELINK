import { z } from "zod";

export const idDocumentTypeSchema = z.enum(["ghana_card", "passport", "voter_id"]);
export type IdDocumentType = z.infer<typeof idDocumentTypeSchema>;

export const photoVerdictSchema = z.enum([
  "likely_match",
  "uncertain",
  "likely_mismatch",
  "not_run",
]);
export type PhotoVerdict = z.infer<typeof photoVerdictSchema>;

// Task 3.2. Files (ID document, optional selfie) travel alongside this
// as multipart form fields, not in this schema.
export const submitVerificationSchema = z.object({
  idDocumentType: idDocumentTypeSchema,
  idDocumentNumber: z.string().trim().min(1, "Enter your ID number"),
  referenceName: z.string().trim().min(1, "Enter a reference name"),
  referencePhone: z.string().trim().min(1, "Enter a reference phone number"),
  referenceRelation: z.string().trim().optional(),
  consentPhoto: z.coerce.boolean().optional().default(false),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

// Task 3.4. A rejection reason is required — enforced again here and by
// a CHECK constraint at the database level.
export const reviewVerificationSchema = z
  .object({
    decision: z.enum(["verified", "rejected"]),
    rejectionReason: z.string().trim().optional(),
  })
  .refine((v) => v.decision !== "rejected" || Boolean(v.rejectionReason), {
    message: "A rejection reason is required",
    path: ["rejectionReason"],
  });
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;
