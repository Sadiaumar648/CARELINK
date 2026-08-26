import { z } from "zod";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");

// Task 2.11. The four-step request sheet (doc 3, App Flow, §3.2) submits
// as one call once the parent confirms the review step.
export const createBookingRequestSchema = z
  .object({
    staffProfileId: z.string().uuid(),
    wardId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    startTime: timeString,
    endTime: timeString,
    address: z.string().trim().min(1, "Enter an address"),
    oneOffNotes: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.endTime > b.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>;

// Task 2.12. A short list plus a free field, matching doc 3's "a reason
// from a short list plus a free field" for the decline action.
export const declineBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type DeclineBookingInput = z.infer<typeof declineBookingSchema>;
