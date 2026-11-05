import { z } from "zod";
import { skillTagSchema } from "../enums";
import { repeatModeSchema, weekdaySchema } from "../schedule";
import { caregiverTypeSchema } from "./staff-profile";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");

// The structured-request contract the direct Nanny/Babysitter form
// creates a care_requests row through, enforcing the location rule
// server-side.
export const createCareRequestSchema = z
  .object({
    // The child (or children) this request is for — one or more,
    // all owned by the parent, the first being the primary. Price is
    // regular rate × hours × wardIds.length, computed server-side.
    wardIds: z.array(z.string().uuid()).min(1).max(10).optional(),
    // Optional: a parent may name one specific caregiver to try before
    // CareLink's normal sequential search — see lib/services/dispatch.ts.
    // Real eligibility (type, date/time, service area) is always
    // checked server-side when dispatch actually runs; this is never
    // trusted as a guarantee.
    preferredStaffProfileId: z.string().uuid().optional(),
    caregiverType: caregiverTypeSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    startTime: timeString,
    endTime: timeString,
    // How many consecutive days of care, each a standard care day
    // (CARE_DAY_HOURS) starting at startTime. `date` is day one.
    durationDays: z.number().int().min(1).max(7).default(1),
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
