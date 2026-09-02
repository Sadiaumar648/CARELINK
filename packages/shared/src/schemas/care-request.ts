import { z } from "zod";
import { skillTagSchema } from "../enums";
import { caregiverTypeSchema } from "./staff-profile";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");

// The one new structured-request contract, shared by the AI assistant's
// confirmation step and the direct Nanny/Babysitter form — both create a
// care_requests row through this same schema, so the location rule is
// enforced identically no matter which path a parent came through.
export const createCareRequestSchema = z
  .object({
    // Optional: the direct Nanny/Babysitter form has no ward picker
    // today (only a soft age select), so it never sends one — the real
    // ward is still always chosen and required at actual booking time
    // (BookingRequestForm). The CareLink AI flow's confirmation step, by
    // contrast, always sources a real wardId from the parent's own
    // GET /api/wards before this is called.
    wardId: z.string().uuid().optional(),
    source: z.enum(["ai", "direct"]),
    caregiverType: caregiverTypeSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    startTime: timeString,
    endTime: timeString,
    // The enforced rule: no location, no request. Real backend
    // validation, not a UI-only check.
    location: z.string().trim().min(1, "Add a care location before searching"),
    skills: z.array(skillTagSchema).max(10).optional(),
    notes: z.string().trim().max(1000).optional(),
    aiRecommendation: caregiverTypeSchema.optional(),
    aiRecommendationReason: z.string().trim().max(500).optional(),
  })
  .refine((r) => r.endTime > r.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export type CreateCareRequestInput = z.infer<typeof createCareRequestSchema>;

// What the AI assistant returns each turn. `readyToConfirm` is
// recomputed server-side from `draft` — see lib/services/care-assistant.ts
// — never trusted verbatim from the model's own claim.
export const careRequestDraftSchema = z.object({
  caregiverType: caregiverTypeSchema.optional(),
  wardAgeYears: z.number().min(0).max(17).optional(),
  wardName: z.string().max(100).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  location: z.string().max(200).optional(),
  skills: z.array(skillTagSchema).optional(),
  notes: z.string().max(500).optional(),
});

export type CareRequestDraft = z.infer<typeof careRequestDraftSchema>;

// One turn of the CareLink AI conversation. The full visible transcript
// (what the parent actually saw — the assistant's plain-text replies,
// never the raw structured output) is sent each time, since the endpoint
// is stateless — mirrors this project's existing single-shot AI route
// (/api/search/parse) in spirit, just carrying history. `draft` is the
// client's current accumulated understanding, sent back each turn so the
// model always has perfect memory of what's already confirmed instead of
// having to re-infer it from the conversation alone.
export const careAssistantMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
  draft: careRequestDraftSchema.optional(),
});

export type CareAssistantMessageInput = z.infer<typeof careAssistantMessageSchema>;
