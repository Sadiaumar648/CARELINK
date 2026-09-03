import { z } from "zod";
import { skillTagSchema } from "../enums";
import { repeatModeSchema, weekdaySchema } from "../schedule";
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
    // validation, not a UI-only check. Kept as the coarse area/suburb
    // string (never a full street address) so it keeps exact-matching
    // against staff_areas.area exactly as it always has — see
    // serviceAddress below for what the parent actually sees.
    location: z.string().trim().min(1, "Add a care location before searching"),
    // CareLink's finalized location system: the actual place WHERE CARE
    // WILL TAKE PLACE, resolved to a real map point — never just a typed
    // area name. serviceAddress is the full, precise, human-readable
    // address shown to and confirmed by the parent (distinct from the
    // coarse `location` above). locationResolved is checked (below,
    // .refine) for being the literal `true` — not merely present — so a
    // client can't claim a location is resolved without also sending
    // the coordinates that make it so.
    serviceAddress: z.string().trim().min(1).max(300),
    serviceLatitude: z.number().min(-90).max(90),
    serviceLongitude: z.number().min(-180).max(180),
    locationPlaceId: z.string().trim().max(200).optional(),
    locationSource: z.enum(["current_location", "gps_address"]),
    locationResolved: z.boolean(),
    skills: z.array(skillTagSchema).max(10).optional(),
    notes: z.string().trim().max(1000).optional(),
    aiRecommendation: caregiverTypeSchema.optional(),
    aiRecommendationReason: z.string().trim().max(500).optional(),
    // CareLink's finalized fixed-rate model needs a real, structured
    // recurrence pattern to independently calculate a session count —
    // "Weekly" and "Custom schedule" are no longer just descriptive text
    // folded into notes. `date`/`startTime`/`endTime` above still
    // describe the one real occurrence every care_requests row (and the
    // one real booking dispatch ever creates) actually has; these
    // fields describe the wider pattern it's part of, for an honest,
    // server-computed session count and series total — see
    // lib/services/pricing.ts (backend) for where that's calculated.
    repeatMode: repeatModeSchema.default("once"),
    repeatWeekdays: z.array(weekdaySchema).max(7).default([]),
    repeatStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    repeatEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
  })
  .refine((r) => r.endTime > r.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((r) => r.locationResolved === true, {
    message: "Add an exact, map-resolved care location before continuing",
    path: ["locationResolved"],
  })
  .refine((r) => r.repeatMode === "once" || r.repeatWeekdays.length > 0, {
    message: "Choose at least one day of the week for this schedule",
    path: ["repeatWeekdays"],
  })
  .refine((r) => r.repeatMode !== "weekly" || r.repeatWeekdays.length === 1, {
    message: "A weekly schedule has exactly one selected day",
    path: ["repeatWeekdays"],
  })
  .refine((r) => r.repeatMode === "once" || Boolean(r.repeatStartDate && r.repeatEndDate), {
    message: "Choose a start date and end date for this schedule",
    path: ["repeatEndDate"],
  })
  .refine(
    (r) =>
      r.repeatMode === "once" ||
      !r.repeatStartDate ||
      !r.repeatEndDate ||
      r.repeatEndDate >= r.repeatStartDate,
    { message: "End date can't be before the start date", path: ["repeatEndDate"] },
  );

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
