import type { z } from "zod";
import type { caregiverTypeSchema } from "./schemas/staff-profile";

type CaregiverType = z.infer<typeof caregiverTypeSchema>;

// CareLink's finalized fixed-rate pricing model: every caregiver costs
// the same GH₵45/hour — Nanny and Babysitter are no longer priced
// differently (CareLink now presents every caregiver as a "Nanny";
// `caregiver_type` still exists on staff_profiles/care_requests as a
// historical/internal value, but nothing charges differently based on
// it any more). Kept here, in the one package both workspaces already
// import shared enums/schemas from, so the frontend (informational
// display only) and the backend (the authoritative calculation — every
// booking-creation call site in carelink-backend) read from the exact
// same number instead of two copies that could drift apart.
// staff_profiles.hourly_rate still exists in the database for
// historical bookings created before this model; nothing here reads it,
// and no new booking is priced from it.
export const CARELINK_HOURLY_RATES: Record<CaregiverType, number> = {
  nanny: 45,
  babysitter: 45,
};

/** The one fixed rate for a care type — never a caregiver-specific value. */
export function hourlyRateFor(caregiverType: CaregiverType): number {
  return CARELINK_HOURLY_RATES[caregiverType];
}

// The one calculation every real charge in this app is built from:
// fixed hourly rate × duration × how many sessions it covers. A real
// `bookings` row is always exactly one session (sessionCount defaults
// to 1) — this app's dispatch/booking architecture stays single-
// session; a `care_requests` row covering a Weekly/Custom pattern
// passes its actual session count for an informational series total
// only, never as what a single booking is charged. Throws rather than
// returning a fabricated fallback if the inputs can't produce a real,
// positive number — a booking must never be created with a negative,
// zero, or NaN total.
export function calculateTotalAmount(
  caregiverType: CaregiverType,
  durationHours: number,
  sessionCount = 1,
): number {
  const amount = Math.round(hourlyRateFor(caregiverType) * durationHours * sessionCount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Could not calculate a valid total amount for this request");
  }
  return amount;
}
