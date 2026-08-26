import { z } from "zod";
import { dayPartSchema } from "../enums";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");

// Task 2.3: a tapped weekly grid of day-of-week against a named part of
// the day, plus specific dates marked off (doc 3, App Flow, §2.3 step 3).
export const availabilityWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    part: dayPartSchema,
    startTime: timeString,
    endTime: timeString,
  })
  .refine((w) => w.endTime > w.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const availabilityExceptionSchema = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  unavailable: z.boolean().default(true),
  note: z.string().trim().max(200).optional(),
});

export const staffAvailabilitySchema = z.object({
  windows: z.array(availabilityWindowSchema),
  exceptions: z.array(availabilityExceptionSchema).default([]),
});

export type StaffAvailabilityInput = z.infer<typeof staffAvailabilitySchema>;
