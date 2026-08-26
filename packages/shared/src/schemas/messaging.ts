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

export const reportCategorySchema = z.enum(["no_show", "conduct", "payment", "safety", "other"]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

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
