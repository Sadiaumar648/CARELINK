import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const staffResponseSchema = z.object({
  staffResponse: z.string().trim().min(1).max(1000),
});
export type StaffResponseInput = z.infer<typeof staffResponseSchema>;

// The caregiver -> parent direction (public.caregiver_reviews), the
// same shape as createReviewSchema — deliberately not shared as one
// schema, since the two directions are independent, structurally
// separate tables and are meant to evolve independently.
export const createCaregiverReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateCaregiverReviewInput = z.infer<typeof createCaregiverReviewSchema>;

export const reportCategorySchema = z.enum(["no_show", "conduct", "payment", "safety", "other"]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

// A plain text marker, not a schema column — an SOS alert is just a
// "safety"-category report (see createReportSchema below) whose
// description starts with this string, so the existing admin reports
// queue can flag it as urgent without a new severity column, and the
// caregiver-side SOS screen and the admin reports page agree on the
// exact same string.
export const SOS_REPORT_MARKER = "🚨 SOS EMERGENCY ALERT";

export const createReportSchema = z.object({
  bookingId: z.string().uuid().optional(),
  subjectUserId: z.string().uuid(),
  category: reportCategorySchema,
  description: z.string().trim().min(1, "Describe what happened").max(4000),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  status: z.enum(["investigating", "resolved"]),
  resolutionNote: z.string().trim().optional(),
});
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
