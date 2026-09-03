import { z } from "zod";

// Weekly = exactly one selected day, every week between two dates.
// Custom = any number of selected days, same range mechanic. Kept as
// one pure module (no DOM/React) so both the parent request form's own
// live "this will repeat N times" display and the backend's
// authoritative session-count calculation (POST /api/care-requests)
// use the exact same date arithmetic — never two implementations that
// could disagree.
export const weekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export type Weekday = z.infer<typeof weekdaySchema>;

export const repeatModeSchema = z.enum(["once", "weekly", "custom"]);
export type RepeatMode = z.infer<typeof repeatModeSchema>;

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * The first real calendar date on/after `fromDateStr` that falls on one
 * of `weekdays` — always found within 7 days, since every weekday
 * occurs at least once in any 7-day span. This is what a Weekly/Custom
 * request's one real, single-session occurrence is dated from — an
 * accurate date consistent with the chosen pattern, never an arbitrary
 * one.
 */
export function firstMatchingDate(fromDateStr: string, weekdays: Weekday[]): string | null {
  if (!fromDateStr || weekdays.length === 0) return null;
  const from = new Date(`${fromDateStr}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + i);
    if (weekdays.some((w) => WEEKDAY_INDEX[w] === candidate.getDay())) {
      return candidate.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** How many real calendar dates between the two dates (inclusive) fall on one of `weekdays`. */
export function countOccurrences(
  startDateStr: string,
  endDateStr: string,
  weekdays: Weekday[],
): number {
  if (!startDateStr || !endDateStr || weekdays.length === 0) return 0;
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);
  if (end < start) return 0;
  const targets = new Set(weekdays.map((w) => WEEKDAY_INDEX[w]));
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (targets.has(d.getDay())) count += 1;
  }
  return count;
}

/** Once is always exactly 1 session; Weekly/Custom count real matching dates in the range. */
export function sessionCountFor(
  mode: RepeatMode,
  weekdays: Weekday[],
  startDateStr: string | null,
  endDateStr: string | null,
): number {
  if (mode === "once") return 1;
  return countOccurrences(startDateStr ?? "", endDateStr ?? "", weekdays);
}
