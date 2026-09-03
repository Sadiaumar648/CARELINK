import { z } from "zod";
import { skillTagSchema } from "../enums";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");

// Task 2.6. Date/time is optional — browsing without a specific slot is
// allowed (doc 3, App Flow, §3.1); when given, both a start and end time
// are required together, and a time window needs a date.
export const searchCaregiversQuerySchema = z
  .object({
    area: z.string().trim().min(1).optional(),
    // CareLink location system, Part 7: real coordinates for proximity
    // scoring, when the caller has them (today: dispatch, from a care
    // request's resolved service location). Optional and additive —
    // omitting them falls back to the existing area-string match
    // exactly as before; nothing about ordinary search's behaviour
    // changes just because this field exists.
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    budgetCeiling: z.coerce.number().int().positive().optional(),
    minExperience: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    skills: z.array(skillTagSchema).optional(),
  })
  .refine((q) => Boolean(q.startTime) === Boolean(q.endTime), {
    message: "Provide both a start and an end time, or neither",
    path: ["endTime"],
  })
  .refine((q) => !((q.startTime || q.endTime) && !q.date), {
    message: "A time window needs a date",
    path: ["date"],
  })
  .refine((q) => Boolean(q.latitude != null) === Boolean(q.longitude != null), {
    message: "Provide both latitude and longitude, or neither",
    path: ["longitude"],
  });

export type SearchCaregiversQuery = z.infer<typeof searchCaregiversQuerySchema>;
